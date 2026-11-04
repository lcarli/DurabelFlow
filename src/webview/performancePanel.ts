import * as vscode from 'vscode';
import { DurableApiClient } from '../providers/durableApiClient';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryService';
import { ExtensionConfig } from '../utils/config';
import { OrchestrationInstance } from '../models';

type TimeRange = '1h' | '24h' | '7d';

interface OrchestratorStats {
  name: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  avgDurationMs: number;
}

interface PerformanceData {
  running: number;
  completed: number;
  failed: number;
  total: number;
  orchestratorStats: OrchestratorStats[];
}

type PanelMessage =
  | { type: 'performanceUpdate'; data: PerformanceData }
  | { type: 'error'; message: string };

type PanelCommand =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'changeTimeRange'; range: TimeRange };

export class PerformancePanel {
  public static currentPanel: PerformancePanel | undefined;
  private static readonly viewType = 'durableFunctionsUI.performanceDashboard';

  private readonly panel: vscode.WebviewPanel;
  private readonly durableClient: DurableApiClient;
  private readonly config: ExtensionConfig;
  private readonly logger = Logger.getInstance();
  private disposables: vscode.Disposable[] = [];
  private pollingTimer?: ReturnType<typeof setInterval>;
  private currentTimeRange: TimeRange = '24h';

  private constructor(
    panel: vscode.WebviewPanel,
    durableClient: DurableApiClient,
    config: ExtensionConfig,
  ) {
    this.panel = panel;
    this.durableClient = durableClient;
    this.config = config;

    this.panel.webview.html = this.getHtmlContent();

    this.panel.webview.onDidReceiveMessage(
      (msg: PanelCommand) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(
    durableClient: DurableApiClient,
    config: ExtensionConfig,
  ) {
    if (PerformancePanel.currentPanel) {
      PerformancePanel.currentPanel.panel.reveal();
      return PerformancePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PerformancePanel.viewType,
      'DurableFlow: Performance Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    panel.iconPath = new vscode.ThemeIcon('dashboard');
    PerformancePanel.currentPanel = new PerformancePanel(panel, durableClient, config);
    TelemetryService.getInstance().trackEvent('performanceDashboardOpened');
    return PerformancePanel.currentPanel;
  }

  private async handleMessage(msg: PanelCommand) {
    switch (msg.type) {
      case 'ready':
      case 'refresh':
        await this.fetchPerformanceData();
        this.startPolling();
        break;

      case 'changeTimeRange':
        this.currentTimeRange = msg.range;
        await this.fetchPerformanceData();
        break;
    }
  }

  private getTimeRangeFilter(): string {
    const now = new Date();
    switch (this.currentTimeRange) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  private computeMetrics(instances: OrchestrationInstance[]): PerformanceData {
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const inst of instances) {
      switch (inst.runtimeStatus) {
        case 'Running':
        case 'Pending':
        case 'ContinuedAsNew':
          running++;
          break;
        case 'Completed':
          completed++;
          break;
        case 'Failed':
        case 'Terminated':
        case 'Canceled':
          failed++;
          break;
      }
    }

    const byName = new Map<string, OrchestrationInstance[]>();
    for (const inst of instances) {
      const list = byName.get(inst.name) ?? [];
      list.push(inst);
      byName.set(inst.name, list);
    }

    const orchestratorStats: OrchestratorStats[] = [];
    byName.forEach((group, name) => {
      const total = group.length;
      const completedCount = group.filter(i => i.runtimeStatus === 'Completed').length;
      const failedCount = group.filter(i =>
        i.runtimeStatus === 'Failed' || i.runtimeStatus === 'Terminated' || i.runtimeStatus === 'Canceled',
      ).length;
      const runningCount = group.filter(i =>
        i.runtimeStatus === 'Running' || i.runtimeStatus === 'Pending' || i.runtimeStatus === 'ContinuedAsNew',
      ).length;

      const finishedInstances = group.filter(i =>
        i.runtimeStatus === 'Completed' || i.runtimeStatus === 'Failed' || i.runtimeStatus === 'Terminated',
      );

      let avgDurationMs = 0;
      if (finishedInstances.length > 0) {
        const totalDuration = finishedInstances.reduce((sum, i) => {
          const created = new Date(i.createdTime).getTime();
          const updated = new Date(i.lastUpdatedTime).getTime();
          return sum + (updated - created);
        }, 0);
        avgDurationMs = totalDuration / finishedInstances.length;
      }

      const successRate = total > 0 ? (completedCount / total) * 100 : 0;

      orchestratorStats.push({
        name,
        total,
        completed: completedCount,
        failed: failedCount,
        running: runningCount,
        successRate,
        avgDurationMs,
      });
    });

    orchestratorStats.sort((a, b) => b.total - a.total);

    return {
      running,
      completed,
      failed,
      total: instances.length,
      orchestratorStats,
    };
  }

  private async fetchPerformanceData() {
    try {
      const instances = await this.durableClient.listInstances({
        createdTimeFrom: this.getTimeRangeFilter(),
        top: this.config.maxInstances,
        showInput: false,
      });

      const data = this.computeMetrics(instances);
      this.sendMessage({ type: 'performanceUpdate', data });
    } catch (error) {
      this.logger.error('Error fetching performance data', error);
      this.sendMessage({ type: 'error', message: `Failed to fetch performance data: ${error}` });
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollingTimer = setInterval(() => this.fetchPerformanceData(), this.config.pollingIntervalMs);
  }

  private stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private sendMessage(message: PanelMessage) {
    this.panel.webview.postMessage(message);
  }

  private getHtmlContent(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Performance Dashboard</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
    .toolbar button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    .toolbar button.active { outline: 2px solid var(--vscode-focusBorder); }
    .title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
    .summary-cards { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .card { flex: 1; min-width: 140px; padding: 14px; border-radius: 6px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .card-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; margin-bottom: 4px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-running .card-value { color: #4dabf7; }
    .card-completed .card-value { color: #51cf66; }
    .card-failed .card-value { color: #ff6b6b; }
    .card-total .card-value { color: var(--vscode-editor-foreground); }
    .section-title { font-size: 13px; font-weight: 600; margin: 16px 0 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--vscode-panel-border); font-weight: 600; position: sticky; top: 0; background: var(--vscode-editor-background); }
    td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    tr:hover { background: var(--vscode-list-hoverBackground); }
    .rate-good { color: #51cf66; }
    .rate-warn { color: #ffd43b; }
    .rate-bad { color: #ff6b6b; }
    .empty { text-align: center; padding: 40px; opacity: 0.6; }
    .bar-bg { background: var(--vscode-input-background); border-radius: 4px; height: 6px; width: 80px; display: inline-block; vertical-align: middle; margin-left: 6px; }
    .bar-fill { height: 100%; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="title">⚡ Performance Dashboard</div>

  <div class="toolbar">
    <button class="range-btn" data-range="1h">Last 1h</button>
    <button class="range-btn active" data-range="24h">Last 24h</button>
    <button class="range-btn" data-range="7d">Last 7d</button>
    <button id="refreshBtn">🔄 Refresh</button>
  </div>

  <div class="summary-cards">
    <div class="card card-total"><div class="card-label">Total</div><div class="card-value" id="totalCount">—</div></div>
    <div class="card card-running"><div class="card-label">Running</div><div class="card-value" id="runningCount">—</div></div>
    <div class="card card-completed"><div class="card-label">Completed</div><div class="card-value" id="completedCount">—</div></div>
    <div class="card card-failed"><div class="card-label">Failed</div><div class="card-value" id="failedCount">—</div></div>
  </div>

  <div class="section-title">Per-Orchestrator Stats</div>
  <table>
    <thead>
      <tr>
        <th>Orchestrator</th>
        <th>Total Runs</th>
        <th>Success Rate</th>
        <th>Avg Duration</th>
        <th>Running</th>
        <th>Completed</th>
        <th>Failed</th>
      </tr>
    </thead>
    <tbody id="statsBody">
      <tr><td colspan="7" class="empty">Loading...</td></tr>
    </tbody>
  </table>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        vscode.postMessage({ type: 'changeTimeRange', range: btn.dataset.range });
      });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'performanceUpdate') {
        renderData(msg.data);
      } else if (msg.type === 'error') {
        document.getElementById('statsBody').innerHTML =
          '<tr><td colspan="7" class="empty">Error: ' + esc(msg.message) + '</td></tr>';
      }
    });

    function renderData(data) {
      document.getElementById('totalCount').textContent = data.total;
      document.getElementById('runningCount').textContent = data.running;
      document.getElementById('completedCount').textContent = data.completed;
      document.getElementById('failedCount').textContent = data.failed;

      const body = document.getElementById('statsBody');
      if (data.orchestratorStats.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="empty">No orchestration data</td></tr>';
        return;
      }

      body.innerHTML = data.orchestratorStats.map(s => {
        const rateClass = s.successRate >= 90 ? 'rate-good' : s.successRate >= 50 ? 'rate-warn' : 'rate-bad';
        const barColor = s.successRate >= 90 ? '#51cf66' : s.successRate >= 50 ? '#ffd43b' : '#ff6b6b';
        return '<tr>' +
          '<td><strong>' + esc(s.name) + '</strong></td>' +
          '<td>' + s.total + '</td>' +
          '<td class="' + rateClass + '">' + s.successRate.toFixed(1) + '%' +
            '<span class="bar-bg"><span class="bar-fill" style="width:' + s.successRate + '%;background:' + barColor + '"></span></span>' +
          '</td>' +
          '<td>' + formatDuration(s.avgDurationMs) + '</td>' +
          '<td>' + s.running + '</td>' +
          '<td>' + s.completed + '</td>' +
          '<td>' + s.failed + '</td>' +
        '</tr>';
      }).join('');
    }

    function formatDuration(ms) {
      if (ms === 0) return '—';
      if (ms < 1000) return ms.toFixed(0) + 'ms';
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
      if (ms < 3600000) return (ms / 60000).toFixed(1) + 'm';
      return (ms / 3600000).toFixed(1) + 'h';
    }

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  dispose() {
    PerformancePanel.currentPanel = undefined;
    this.stopPolling();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
