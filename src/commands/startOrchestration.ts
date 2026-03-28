import * as vscode from 'vscode';
import { CommandContext } from './index';
import { FunctionTreeItem } from '../views/functionsTreeView';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryService';
import { FlowPanel } from '../webview/flowPanel';

export async function startOrchestration(ctx: CommandContext, item?: FunctionTreeItem) {
  const logger = Logger.getInstance();

  let functionName: string | undefined;

  // Use the active provider (local or Azure) to list orchestrators
  const activeProvider = ctx.providerFactory
    ? ctx.providerFactory.getActiveProvider()
    : ctx.localProvider;

  if (item?.func?.type === 'orchestrator') {
    functionName = item.func.name;
  } else {
    const functions = await activeProvider.listFunctions();
    const orchestrators = functions.filter((f) => f.type === 'orchestrator');

    if (orchestrators.length === 0) {
      vscode.window.showWarningMessage('No orchestrator functions found.');
      return;
    }

    functionName = await vscode.window.showQuickPick(
      orchestrators.map((o) => o.name),
      { placeHolder: 'Select an orchestrator to start' },
    );
  }

  if (!functionName) return;

  // If using Azure, update the DurableApiClient to point at the Azure host
  if (ctx.providerFactory?.isUsingAzure()) {
    const azureProvider = ctx.providerFactory.getAzureProvider();
    const baseUrl = azureProvider.getBaseUrl();
    if (baseUrl) {
      ctx.durableClient.updateBaseUrl(baseUrl);
      const connInfo = azureProvider.getConnectionInfo();
      logger.info(`Starting orchestration on Azure: ${connInfo.functionAppName}`);
    }
  }

  // Ask for input
  const inputStr = await vscode.window.showInputBox({
    prompt: `Input JSON for ${functionName} (leave empty for null)`,
    placeHolder: '{"key": "value"}',
    validateInput: (value) => {
      if (!value) return null;
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'Invalid JSON';
      }
    },
  });

  if (inputStr === undefined) return; // Cancelled

  const input = inputStr ? JSON.parse(inputStr) : null;

  // Optional instance ID
  const instanceId = await vscode.window.showInputBox({
    prompt: 'Custom instance ID (leave empty for auto-generated)',
    placeHolder: 'my-instance-id',
  });

  if (instanceId === undefined) return; // Cancelled

  const result = await ctx.durableClient.startOrchestration(
    functionName,
    input,
    instanceId || undefined,
  );

  if (result) {
    // Auto-open the flow panel for the new instance
    FlowPanel.createOrShow(ctx.extensionUri, ctx.durableClient, result.instanceId);

    const action = await vscode.window.showInformationMessage(
      `Orchestration "${functionName}" started! Instance ID: ${result.instanceId}`,
      'Refresh Instances',
    );

    if (action === 'Refresh Instances') {
      ctx.instancesTree.refresh();
    }

    logger.info(`Started orchestration ${functionName}`, result.instanceId);
    TelemetryService.getInstance().trackEvent('orchestrationStarted');
  } else {
    vscode.window.showErrorMessage(`Failed to start orchestration "${functionName}".`);
  }
}
