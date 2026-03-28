import * as vscode from 'vscode';
import { CommandContext } from './index';
import { InstanceTreeItem } from '../views/instancesTreeView';
import { Logger } from '../utils/logger';

export async function terminateInstance(ctx: CommandContext, item?: InstanceTreeItem) {
  const logger = Logger.getInstance();

  let instanceId: string | undefined;
  if (item?.instance) {
    instanceId = item.instance.instanceId;
  } else {
    instanceId = await vscode.window.showInputBox({
      prompt: 'Enter the instance ID to terminate',
      placeHolder: 'instance-id',
    });
  }

  if (!instanceId) return;

  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to terminate instance ${instanceId.substring(0, 8)}...?`,
    { modal: true },
    'Terminate',
  );

  if (confirm !== 'Terminate') return;

  const reason = await vscode.window.showInputBox({
    prompt: 'Reason for termination (optional)',
    placeHolder: 'Manual termination',
  });

  if (reason === undefined) return;

  const success = await ctx.durableClient.terminateInstance(instanceId, reason);

  if (success) {
    vscode.window.showInformationMessage(`Instance ${instanceId.substring(0, 8)}... terminated.`);
    ctx.instancesTree.refresh();
    logger.info(`Terminated instance ${instanceId}`);
  } else {
    vscode.window.showErrorMessage('Failed to terminate instance.');
  }
}
