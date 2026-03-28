import * as vscode from 'vscode';
import { CommandContext } from './index';
import { InstanceTreeItem } from '../views/instancesTreeView';
import { Logger } from '../utils/logger';

export async function raiseEvent(ctx: CommandContext, item?: InstanceTreeItem) {
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

  const eventName = await vscode.window.showInputBox({
    prompt: 'Enter the event name',
    placeHolder: 'ApprovalEvent',
  });

  if (!eventName) return;

  const eventDataStr = await vscode.window.showInputBox({
    prompt: 'Event data JSON (leave empty for null)',
    placeHolder: '{"approved": true}',
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

  if (eventDataStr === undefined) return;

  const eventData = eventDataStr ? JSON.parse(eventDataStr) : null;
  const success = await ctx.durableClient.raiseEvent(instanceId, eventName, eventData);

  if (success) {
    vscode.window.showInformationMessage(
      `Event "${eventName}" raised for instance ${instanceId.substring(0, 8)}...`,
    );
    ctx.instancesTree.refresh();
    logger.info(`Raised event ${eventName} on instance ${instanceId}`);
  } else {
    vscode.window.showErrorMessage(`Failed to raise event "${eventName}".`);
  }
}
