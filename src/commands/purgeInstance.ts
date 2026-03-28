import * as vscode from 'vscode';
import { CommandContext } from './index';
import { InstanceTreeItem } from '../views/instancesTreeView';
import { Logger } from '../utils/logger';

export async function purgeInstance(ctx: CommandContext, item?: InstanceTreeItem) {
  const logger = Logger.getInstance();

  let instanceId: string | undefined;
  if (item?.instance) {
    instanceId = item.instance.instanceId;
  } else {
    instanceId = await vscode.window.showInputBox({
      prompt: 'Enter the instance ID to purge',
      placeHolder: 'instance-id',
    });
  }

  if (!instanceId) return;

  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to purge instance ${instanceId.substring(0, 8)}...? This will delete all history.`,
    { modal: true },
    'Purge',
  );

  if (confirm !== 'Purge') return;

  const success = await ctx.durableClient.purgeInstance(instanceId);

  if (success) {
    vscode.window.showInformationMessage(
      `Instance ${instanceId.substring(0, 8)}... purged successfully.`,
    );
    ctx.instancesTree.refresh();
    logger.info(`Purged instance ${instanceId}`);
  } else {
    vscode.window.showErrorMessage('Failed to purge instance.');
  }
}
