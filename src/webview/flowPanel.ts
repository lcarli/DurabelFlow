import * as vscode from 'vscode';
import * as path from 'path';
import { DurableApiClient } from '../providers/durableApiClient';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryService';

type ExtensionMessage =
  | { type: 'instanceUpdate'; instance: unknown }
  | { type: 'flowData'; nodes: unknown[]; edges: unknown[] }
  | { type: 'error'; message: string };

type WebViewMessage =
  | { type: 'ready' }
  | { type: 'requestInstanceStatus'; instanceId: string }
  | { type: 'navigateToCode'; functionName: string }
  | { type: 'startPolling'; instanceId: string }
  | { type: 'stopPolling' }
  | { type: 'exportDiagram'; format: 'png' | 'svg' }
  | { type: 'raiseEvent'; instanceId: string; eventName: string; eventData?: unknown }
  | { type: 'terminateInstance'; instanceId: string };

export class FlowPanel {
  public static currentPanel: FlowPanel | undefined;
  private static readonly viewType = 'durableFunctionsUI.flowPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly durableClient: DurableApiClient;
  private readonly logger = Logger.getInstance();
  private disposables: vscode.Disposable[] = [];
  private pollingTimer?: ReturnType<typeof setInterval>;
  private currentInstanceId?: string;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    durableClient: DurableApiClient,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.durableClient = durableClient;

    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from WebView
    this.panel.webview.onDidReceiveMessage(
      (message: WebViewMessage) => this.handleMessage(message),
      null,
      this.disposables,
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    durableClient: DurableApiClient,
    instanceId?: string,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, show it
    if (FlowPanel.currentPanel) {
      FlowPanel.currentPanel.panel.reveal(column);
      if (instanceId) {
        FlowPanel.currentPanel.showInstance(instanceId);
      }
      return FlowPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      FlowPanel.viewType,
      'DurableFlow: Orchestration Flow',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
        ],
      },
    );

    panel.iconPath = new vscode.ThemeIcon('type-hierarchy');

    FlowPanel.currentPanel = new FlowPanel(panel, extensionUri, durableClient);
    TelemetryService.getInstance().trackEvent('flowPanelOpened');

    if (instanceId) {
      FlowPanel.currentPanel.showInstance(instanceId);
    }

    return FlowPanel.currentPanel;
  }

  async showInstance(instanceId: string) {
    this.currentInstanceId = instanceId;
    await this.fetchAndSendInstanceWithRetry(instanceId);
    this.startPolling(instanceId);
  }

  private async fetchAndSendInstanceWithRetry(instanceId: string, retries = 5, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const instance = await this.durableClient.getInstanceStatus(instanceId, true, true);
        if (instance) {
          this.panel.title = `Flow: ${instance.name}`;
          this.sendMessage({ type: 'instanceUpdate', instance });
          return;
        }

        // Instance not found yet — retry
        if (attempt < retries) {
          this.logger.debug(`Instance ${instanceId} not found yet, retry ${attempt}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        if (attempt < retries) {
          this.logger.debug(`Error fetching instance, retry ${attempt}/${retries}...`, error);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          this.logger.error('Error fetching instance after retries', error);
          this.sendMessage({ type: 'error', message: `Failed to fetch instance: ${error}` });
          return;
        }
      }
    }

    this.sendMessage({ type: 'error', message: `Instance ${instanceId} not found after ${retries} retries` });
  }

  private async fetchAndSendInstance(instanceId: string) {
    try {
      const instance = await this.durableClient.getInstanceStatus(instanceId, true, true);
      if (instance) {
        this.panel.title = `Flow: ${instance.name}`;
        this.sendMessage({ type: 'instanceUpdate', instance });
      }
    } catch (error) {
      this.logger.error('Error fetching instance', error);
    }
  }

  private startPolling(instanceId: string) {
    this.stopPolling();
    this.pollingTimer = setInterval(async () => {
      const instance = await this.durableClient.getInstanceStatus(instanceId, true, true);
      if (instance) {
        this.sendMessage({ type: 'instanceUpdate', instance });

        // Stop polling if orchestration completed
        const finalStatuses = ['Completed', 'Failed', 'Terminated', 'Canceled'];
        if (finalStatuses.includes(instance.runtimeStatus)) {
          this.stopPolling();
          this.logger.info(`Instance ${instanceId} reached final state: ${instance.runtimeStatus}`);
        }
      }
    }, 2000);
  }

  private stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private async handleMessage(message: WebViewMessage) {
    switch (message.type) {
      case 'ready':
        this.logger.debug('WebView ready');
        if (this.currentInstanceId) {
          await this.fetchAndSendInstance(this.currentInstanceId);
        }
        break;

      case 'requestInstanceStatus':
        await this.fetchAndSendInstance(message.instanceId);
        break;

      case 'navigateToCode':
        await this.navigateToFunction(message.functionName);
        break;

      case 'startPolling':
        this.startPolling(message.instanceId);
        break;

      case 'stopPolling':
        this.stopPolling();
        break;

      case 'raiseEvent':
        await this.durableClient.raiseEvent(
          message.instanceId,
          message.eventName,
          message.eventData,
        );
        break;

      case 'terminateInstance':
        await this.durableClient.terminateInstance(message.instanceId);
        break;

      case 'exportDiagram':
        vscode.window.showInformationMessage(
          `Export as ${message.format.toUpperCase()} — coming soon!`,
        );
        break;
    }
  }

  private async navigateToFunction(functionName: string) {
    // Search for the function definition in workspace
    const results = await vscode.workspace.findFiles(
      `**/*${functionName}*`,
      '**/node_modules/**',
      5,
    );

    if (results.length === 1) {
      const doc = await vscode.workspace.openTextDocument(results[0]);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    } else if (results.length > 1) {
      const picked = await vscode.window.showQuickPick(
        results.map((r) => ({
          label: path.basename(r.fsPath),
          description: vscode.workspace.asRelativePath(r),
          uri: r,
        })),
        { placeHolder: `Select file for ${functionName}` },
      );
      if (picked) {
        const doc = await vscode.workspace.openTextDocument(picked.uri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }
    } else {
      // Fallback: search text
      vscode.commands.executeCommand('workbench.action.findInFiles', {
        query: functionName,
        isRegex: false,
      });
    }
  }

  private sendMessage(message: ExtensionMessage) {
    this.panel.webview.postMessage(message);
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewUri, 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewUri, 'assets', 'index.css'),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Orchestration Flow</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    #root { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    FlowPanel.currentPanel = undefined;
    this.stopPolling();
    this.panel.dispose();

    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
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
