import * as vscode from 'vscode';
import { LocalProvider } from '../providers/localProvider';
import { DurableApiClient } from '../providers/durableApiClient';
import { ProviderFactory } from '../providers/providerFactory';
import { FunctionsTreeProvider, FunctionTreeItem } from '../views/functionsTreeView';
import { InstancesTreeProvider, InstanceTreeItem } from '../views/instancesTreeView';
import { ConnectionsTreeProvider } from '../views/connectionsTreeView';
import { ExtensionConfig } from '../utils/config';
import { Logger } from '../utils/logger';
import { startOrchestration } from './startOrchestration';
import { raiseEvent } from './raiseEvent';
import { terminateInstance } from './terminateInstance';
import { purgeInstance } from './purgeInstance';
import { triggerFunction } from './triggerFunction';
import { startCoreTools, stopCoreTools } from './coreTools';
import { scaffoldDurableFunction } from './scaffoldWizard';
import { selectFunctionApp } from './azurePicker';
import { getFunctionAppPortalUrl, openInPortal } from '../utils/portalLinks';
import { FlowPanel } from '../webview/flowPanel';
import { DashboardPanel } from '../webview/dashboardPanel';
import { PerformancePanel } from '../webview/performancePanel';
import { AnalyzerService } from '../analyzers';
import { AzureAuthService } from '../services/azureAuthService';
import { TelemetryService } from '../services/telemetryService';

export interface CommandContext {
  localProvider: LocalProvider;
  durableClient: DurableApiClient;
  providerFactory: ProviderFactory;
  functionsTree: FunctionsTreeProvider;
  instancesTree: InstancesTreeProvider;
  connectionsTree: ConnectionsTreeProvider;
  analyzerService: AnalyzerService;
  config: ExtensionConfig;
  extensionUri: vscode.Uri;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  ctx: CommandContext,
) {
  const logger = Logger.getInstance();

  // Handlers declare their own argument types; VS Code passes them untyped at runtime.
  type CommandHandler = (...args: never[]) => unknown;
  const commands: [string, CommandHandler][] = [
    [
      'durableFunctionsUI.refreshFunctions',
      () => ctx.functionsTree.refresh(),
    ],
    [
      'durableFunctionsUI.refreshInstances',
      () => ctx.instancesTree.refresh(),
    ],
    [
      'durableFunctionsUI.startOrchestration',
      (item?: FunctionTreeItem) => startOrchestration(ctx, item),
    ],
    [
      'durableFunctionsUI.raiseEvent',
      (item?: InstanceTreeItem) => raiseEvent(ctx, item),
    ],
    [
      'durableFunctionsUI.terminateInstance',
      (item?: InstanceTreeItem) => terminateInstance(ctx, item),
    ],
    [
      'durableFunctionsUI.purgeInstance',
      (item?: InstanceTreeItem) => purgeInstance(ctx, item),
    ],
    [
      'durableFunctionsUI.triggerFunction',
      (item?: FunctionTreeItem) => triggerFunction(ctx, item),
    ],
    [
      'durableFunctionsUI.viewInstanceDetails',
      (item?: InstanceTreeItem) => viewInstanceDetails(ctx, item),
    ],
    [
      'durableFunctionsUI.startCoreTools',
      () => startCoreTools(ctx),
    ],
    [
      'durableFunctionsUI.stopCoreTools',
      () => stopCoreTools(),
    ],
    [
      'durableFunctionsUI.openSettings',
      () => vscode.commands.executeCommand('workbench.action.openSettings', 'durableFunctionsUI'),
    ],
    [
      'durableFunctionsUI.showOrchestrationFlow',
      (item?: InstanceTreeItem) => showOrchestrationFlow(ctx, item),
    ],
    [
      'durableFunctionsUI.startOrchestrationByName',
      (name: string) => startOrchestrationByName(ctx, name),
    ],
    [
      'durableFunctionsUI.triggerFunctionByName',
      (name: string) => triggerFunctionByName(ctx, name),
    ],
    [
      'durableFunctionsUI.showCallers',
      (name: string, callers: { name: string; filePath: string; line: number }[]) =>
        showCallers(name, callers),
    ],
    [
      'durableFunctionsUI.showDesignFlow',
      (fn: { name: string; callsTo: string[] }) => showDesignFlow(ctx, fn),
    ],
    [
      'durableFunctionsUI.openDashboard',
      () => DashboardPanel.createOrShow(ctx.durableClient, ctx.config, ctx.extensionUri),
    ],
    [
      'durableFunctionsUI.openPerformanceDashboard',
      () => PerformancePanel.createOrShow(ctx.durableClient, ctx.config),
    ],
    [
      'durableFunctionsUI.azureLogin',
      () => AzureAuthService.getInstance().login(),
    ],
    [
      'durableFunctionsUI.azureLogout',
      () => AzureAuthService.getInstance().logout(),
    ],
    [
      'durableFunctionsUI.newDurableFunction',
      () => scaffoldDurableFunction(),
    ],
    [
      'durableFunctionsUI.selectFunctionApp',
      () => selectFunctionApp(ctx.providerFactory, ctx.connectionsTree),
    ],
    [
      'durableFunctionsUI.openInPortal',
      () => openCurrentAppInPortal(ctx),
    ],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown),
    );
    logger.debug(`Registered command: ${id}`);
  }
}

async function viewInstanceDetails(ctx: CommandContext, item?: InstanceTreeItem) {
  const logger = Logger.getInstance();

  let instanceId: string | undefined;
  if (item?.instance) {
    instanceId = item.instance.instanceId;
  } else {
    instanceId = await vscode.window.showInputBox({
      prompt: 'Enter the orchestration instance ID',
      placeHolder: 'instance-id',
    });
  }

  if (!instanceId) return;

  const instance = await ctx.durableClient.getInstanceStatus(instanceId, true, true);

  if (!instance) {
    vscode.window.showWarningMessage(`Instance ${instanceId} not found.`);
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(instance, null, 2),
    language: 'json',
  });
  await vscode.window.showTextDocument(doc, { preview: true });

  logger.info(`Viewing details for instance ${instanceId}`);
}

async function showOrchestrationFlow(ctx: CommandContext, item?: InstanceTreeItem) {
  const logger = Logger.getInstance();

  let instanceId: string | undefined;
  if (item?.instance) {
    instanceId = item.instance.instanceId;
  } else {
    // Show a quick pick of recent instances
    const instances = await ctx.durableClient.listInstances({ top: 20, showInput: false });

    if (instances.length > 0) {
      const items = instances.map((i) => ({
        label: `${statusIcon(i.runtimeStatus)} ${i.name}`,
        description: `${i.runtimeStatus} — ${i.instanceId.substring(0, 12)}...`,
        detail: `Created: ${new Date(i.createdTime).toLocaleString()}`,
        instanceId: i.instanceId,
      }));

      items.push({
        label: '$(edit) Enter instance ID manually...',
        description: '',
        detail: '',
        instanceId: '__manual__',
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an orchestration instance to visualize',
      });

      if (!picked) return;

      if (picked.instanceId === '__manual__') {
        instanceId = await vscode.window.showInputBox({
          prompt: 'Enter the orchestration instance ID',
          placeHolder: 'instance-id',
        });
      } else {
        instanceId = picked.instanceId;
      }
    } else {
      instanceId = await vscode.window.showInputBox({
        prompt: 'Enter the orchestration instance ID to visualize',
        placeHolder: 'instance-id',
      });
    }
  }

  if (!instanceId) return;

  FlowPanel.createOrShow(ctx.extensionUri, ctx.durableClient, instanceId);
  logger.info(`Showing orchestration flow for instance ${instanceId}`);
}

function statusIcon(status: string): string {
  const icons: Record<string, string> = {
    Running: '🔵',
    Completed: '🟢',
    Failed: '🔴',
    Terminated: '🔴',
    Pending: '⚪',
    Suspended: '🟡',
  };
  return icons[status] || '⚪';
}

async function startOrchestrationByName(ctx: CommandContext, name: string) {
  const inputStr = await vscode.window.showInputBox({
    prompt: `Input JSON for ${name} (leave empty for null)`,
    placeHolder: '{"key": "value"}',
    validateInput: (value) => {
      if (!value) return null;
      try { JSON.parse(value); return null; } catch { return 'Invalid JSON'; }
    },
  });
  if (inputStr === undefined) return;

  const input = inputStr ? JSON.parse(inputStr) : null;
  const result = await ctx.durableClient.startOrchestration(name, input);

  if (result) {
    TelemetryService.getInstance().trackEvent('orchestrationStarted');
    // Auto-open the flow panel for the new instance
    FlowPanel.createOrShow(ctx.extensionUri, ctx.durableClient, result.instanceId);
    vscode.window.showInformationMessage(
      `Orchestration "${name}" started! Instance: ${result.instanceId}`,
    );
    ctx.instancesTree.refresh();
  } else {
    vscode.window.showErrorMessage(`Failed to start orchestration "${name}".`);
  }
}

async function triggerFunctionByName(ctx: CommandContext, name: string) {
  try {
    const result = await ctx.localProvider.triggerHttpFunction(name, 'POST');
    const doc = await vscode.workspace.openTextDocument({
      content: `// POST /api/${name}\n// Status: ${result.statusCode}\n\n${typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}`,
      language: 'jsonc',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to trigger "${name}": ${error}`);
  }
}

async function showCallers(name: string, callers: { name: string; filePath: string; line: number }[]) {
  const picked = await vscode.window.showQuickPick(
    callers.map((c) => ({
      label: `🎭 ${c.name}`,
      description: c.filePath.split(/[/\\]/).pop(),
      detail: `Line ${c.line + 1}`,
      caller: c,
    })),
    { placeHolder: `Orchestrators that call "${name}"` },
  );

  if (picked) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(picked.caller.filePath));
    await vscode.window.showTextDocument(doc, {
      selection: new vscode.Range(picked.caller.line, 0, picked.caller.line, 0),
    });
  }
}

async function showDesignFlow(ctx: CommandContext, fn: { name: string; callsTo: string[] }) {
  if (!fn) return;
  // Open the flow panel without a running instance — show static design
  FlowPanel.createOrShow(ctx.extensionUri, ctx.durableClient);
  Logger.getInstance().info(`Showing design flow for ${fn.name}`);
}

async function openCurrentAppInPortal(ctx: CommandContext) {
  if (!ctx.providerFactory.isUsingAzure()) {
    vscode.window.showWarningMessage(
      'No Azure Function App is currently selected. Use "Select Function App" first.',
    );
    return;
  }

  const info = ctx.providerFactory.getAzureProvider().getConnectionInfo();
  if (!info.isConfigured) {
    vscode.window.showWarningMessage('Azure provider is not configured.');
    return;
  }

  const url = getFunctionAppPortalUrl(info.subscriptionId, info.resourceGroup, info.functionAppName);
  await openInPortal(url);
  Logger.getInstance().info(`Opened Azure Portal for ${info.functionAppName}`);
}
