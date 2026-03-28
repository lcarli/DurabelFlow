import * as vscode from 'vscode';

const PORTAL_BASE = 'https://portal.azure.com';

/** Returns the Azure Portal URL for a Function App */
export function getFunctionAppPortalUrl(
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
): string {
  return `${PORTAL_BASE}/#@/resource/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${appName}/functionsList`;
}

/** Returns the Azure Portal URL for a Durable Functions Monitor instance view */
export function getInstancePortalUrl(
  subscriptionId: string,
  resourceGroup: string,
  appName: string,
  instanceId: string,
): string {
  return `${getFunctionAppPortalUrl(subscriptionId, resourceGroup, appName)}?instanceId=${instanceId}`;
}

/** Opens the given URL in the user's default browser via VS Code */
export async function openInPortal(url: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(url));
}
