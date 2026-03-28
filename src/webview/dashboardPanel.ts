import * as vscode from 'vscode';
import { DurableApiClient } from '../providers/durableApiClient';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryService';
import { ExtensionConfig } from '../utils/config';
import { OrchestrationInstance, OrchestrationRuntimeStatus } from '../models';

type DashboardMessage =
  | { type: 'instancesUpdate'; instances: OrchestrationInstance[] }
  | { type: 'error'; message: string };

type DashboardCommand =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'filter'; status?: string[]; namePrefix?: string }
  | { type: 'terminate'; instanceId: string }
  | { type: 'purge'; instanceId: string }
  | { type: 'suspend'; instanceId: string }
  | { type: 'resume'; instanceId: string }
  | { type: 'viewDetails'; instanceId: string }
  | { type: 'showFlow'; instanceId: string }
  | { type: 'bulkPurge'; status: string[] }
  | { type: 'bulkTerminate'; instanceIds: string[] };

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private static readonly viewType = 'durableFunctionsUI.dashboard';

  private readonly panel: vscode.WebviewPanel;
  private readonly durableClient: DurableApiClient;
  private readonly config: ExtensionConfig;
  private readonly logger = Logger.getInstance();
  private disposables: vscode.Disposable[] = [];
  private pollingTimer?: ReturnType<typeof setInterval>;
  private currentFilter: { status?: string[]; namePrefix?: string } = {};

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
      (msg: DashboardCommand) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(
    durableClient: DurableApiClient,
    config: ExtensionConfig,
    _extensionUri: vscode.Uri,
  ) {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal();
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'DurableFlow: Orchestration Instances',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    panel.iconPath = new vscode.ThemeIcon('list-unordered');
    DashboardPanel.currentPanel = new DashboardPanel(panel, durableClient, config);
    TelemetryService.getInstance().trackEvent('dashboardOpened');
    return DashboardPanel.currentPanel;
  }

  private async handleMessage(msg: DashboardCommand) {
    switch (msg.type) {
      case 'ready':
      case 'refresh':
        await this.fetchInstances();
        this.startPolling();
        break;

      case 'filter':
        this.currentFilter = { status: msg.status, namePrefix: msg.namePrefix };
        await this.fetchInstances();
        break;

      case 'terminate':
        if (await this.durableClient.terminateInstance(msg.instanceId, 'Terminated from dashboard')) {
          vscode.window.showInformationMessage(`Instance terminated.`);
          await this.fetchInstances();
        }
        break;

      case 'purge':
        if (await this.durableClient.purgeInstance(msg.instanceId)) {
          vscode.window.showInformationMessage(`Instance purged.`);
          await this.fetchInstances();
        }
        break;

      case 'suspend':
        if (await this.durableClient.suspendInstance(msg.instanceId)) {
          await this.fetchInstances();
        }
        break;

      case 'resume':
        if (await this.durableClient.resumeInstance(msg.instanceId)) {
          await this.fetchInstances();
        }
        break;

      case 'viewDetails':
        vscode.commands.executeCommand('durableFunctionsUI.viewInstanceDetails', {
          instance: { instanceId: msg.instanceId },
        });
        break;

      case 'showFlow':
        vscode.commands.executeCommand('durableFunctionsUI.showOrchestrationFlow', {
          instance: { instanceId: msg.instanceId },
        });
        break;

      case 'bulkTerminate':
        for (const id of msg.instanceIds) {
          await this.durableClient.terminateInstance(id, 'Bulk terminated');
        }
        vscode.window.showInformationMessage(`${msg.instanceIds.length} instances terminated.`);
        await this.fetchInstances();
        break;
    }
  }

  private async fetchInstances() {
    try {
      const instances = await this.durableClient.listInstances({
        runtimeStatus: this.currentFilter.status as OrchestrationRuntimeStatus[] | undefined,
        top: this.config.maxInstances,
        showInput: true,
      });

      let filtered = instances;
      if (this.currentFilter.namePrefix) {
        const prefix = this.currentFilter.namePrefix.toLowerCase();
        filtered = instances.filter((i) => i.name.toLowerCase().includes(prefix));
      }

      this.sendMessage({ type: 'instancesUpdate', instances: filtered });
    } catch (error) {
      this.logger.error('Error fetching instances', error);
      this.sendMessage({ type: 'error', message: `Failed to fetch instances: ${error}` });
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollingTimer = setInterval(() => this.fetchInstances(), this.config.pollingIntervalMs);
  }

  private stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private sendMessage(message: DashboardMessage) {
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
  <title>Orchestration Instances</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
    .toolbar input, .toolbar select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 3px; font-size: 12px; }
    .toolbar input { flex: 1; min-width: 150px; }
    .toolbar button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--vscode-panel-border); font-weight: 600; position: sticky; top: 0; background: var(--vscode-editor-background); }
    td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    tr:hover { background: var(--vscode-list-hoverBackground); }
    .status { padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; }
    .status-Running { background: #0d6efd30; color: #4dabf7; }
    .status-Completed { background: #19875430; color: #51cf66; }
    .status-Failed { background: #dc354530; color: #ff6b6b; }
    .status-Terminated { background: #dc354530; color: #ff6b6b; }
    .status-Pending { background: #6c757d30; color: #adb5bd; }
    .status-Suspended { background: #ffc10730; color: #ffd43b; }
    .actions button { background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: 0.7; }
    .actions button:hover { opacity: 1; }
    .count { font-size: 11px; opacity: 0.7; }
    .empty { text-align: center; padding: 40px; opacity: 0.6; }
    .id-cell { font-family: var(--vscode-editor-fontFamily); font-size: 11px; opacity: 0.8; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="searchInput" placeholder="Search by name..." />
    <select id="statusFilter">
      <option value="">All Statuses</option>
      <option value="Running">Running</option>
      <option value="Completed">Completed</option>
      <option value="Failed">Failed</option>
      <option value="Terminated">Terminated</option>
      <option value="Pending">Pending</option>
      <option value="Suspended">Suspended</option>
    </select>
    <button id="refreshBtn">🔄 Refresh</button>
    <span class="count" id="countLabel"></span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th>Instance ID</th>
        <th>Created</th>
        <th>Updated</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="instancesBody">
      <tr><td colspan="6" class="empty">Loading...</td></tr>
    </tbody>
  </table>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let instances = [];

    document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('searchInput').addEventListener('input', applyFilter);
    document.getElementById('statusFilter').addEventListener('change', applyFilter);

    function applyFilter() {
      const name = document.getElementById('searchInput').value;
      const status = document.getElementById('statusFilter').value;
      vscode.postMessage({ type: 'filter', status: status ? [status] : undefined, namePrefix: name || undefined });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'instancesUpdate') {
        instances = msg.instances;
        render();
      }
    });

    function render() {
      const body = document.getElementById('instancesBody');
      document.getElementById('countLabel').textContent = instances.length + ' instances';

      if (instances.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="empty">No instances found</td></tr>';
        return;
      }

      body.innerHTML = instances.map(i => {
        const created = new Date(i.createdTime).toLocaleString();
        const updated = new Date(i.lastUpdatedTime).toLocaleString();
        const isRunning = ['Running', 'Pending', 'Suspended'].includes(i.runtimeStatus);
        return '<tr>' +
          '<td><strong>' + esc(i.name) + '</strong></td>' +
          '<td><span class="status status-' + i.runtimeStatus + '">' + i.runtimeStatus + '</span></td>' +
          '<td class="id-cell" title="' + esc(i.instanceId) + '">' + esc(i.instanceId) + '</td>' +
          '<td>' + created + '</td>' +
          '<td>' + updated + '</td>' +
          '<td class="actions">' +
            '<button onclick="cmd(\\'showFlow\\',\\'' + esc(i.instanceId) + '\\')" title="Show Flow">📊</button>' +
            '<button onclick="cmd(\\'viewDetails\\',\\'' + esc(i.instanceId) + '\\')" title="View Details">🔍</button>' +
            (isRunning ? '<button onclick="cmd(\\'terminate\\',\\'' + esc(i.instanceId) + '\\')" title="Terminate">🛑</button>' : '') +
            '<button onclick="cmd(\\'purge\\',\\'' + esc(i.instanceId) + '\\')" title="Purge">🗑</button>' +
          '</td></tr>';
      }).join('');
    }

    function cmd(type, instanceId) { vscode.postMessage({ type, instanceId }); }
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  dispose() {
    DashboardPanel.currentPanel = undefined;
    this.stopPolling();
    this.panel.dispose();
    while (this.disposables.length) { this.disposables.pop()?.dispose(); }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
