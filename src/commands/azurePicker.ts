import * as vscode from 'vscode';
import { AzureAuthService } from '../services/azureAuthService';
import { HttpClient } from '../utils/httpClient';
import { Logger } from '../utils/logger';
import { ProviderFactory } from '../providers/providerFactory';
import { ConnectionsTreeProvider } from '../views/connectionsTreeView';

interface ResourceGroup {
  id: string;
  name: string;
  location: string;
}

interface FunctionAppSite {
  id: string;
  name: string;
  kind?: string;
  location: string;
  properties: {
    defaultHostName: string;
    state: string;
  };
}

export async function selectFunctionApp(
  providerFactory: ProviderFactory,
  connectionsTree: ConnectionsTreeProvider,
): Promise<void> {
  const logger = Logger.getInstance();
  const authService = AzureAuthService.getInstance();

  // Ensure the user is logged in
  if (!authService.isLoggedIn()) {
    const loggedIn = await authService.login();
    if (!loggedIn) {
      vscode.window.showErrorMessage('Azure login is required to select a Function App.');
      return;
    }
  }

  // Step 1: Pick a subscription
  const subscriptions = await authService.getSubscriptions();
  if (subscriptions.length === 0) {
    vscode.window.showWarningMessage('No Azure subscriptions found.');
    return;
  }

  const subPick = await vscode.window.showQuickPick(
    subscriptions.map((s) => ({
      label: s.displayName,
      description: s.subscriptionId,
      subscriptionId: s.subscriptionId,
    })),
    { placeHolder: 'Select an Azure subscription', ignoreFocusOut: true },
  );

  if (!subPick) {
    return;
  }

  const subscriptionId = subPick.subscriptionId;
  const accessToken = await authService.getAccessToken();
  if (!accessToken) {
    vscode.window.showErrorMessage('Failed to acquire Azure access token.');
    return;
  }

  const managementClient = new HttpClient('https://management.azure.com', {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });

  // Step 2: Pick a resource group
  let resourceGroups: ResourceGroup[];
  try {
    const rgResponse = await managementClient.get<{ value: ResourceGroup[] }>(
      `/subscriptions/${subscriptionId}/resourcegroups?api-version=2023-07-01`,
    );
    if (rgResponse.statusCode !== 200 || !rgResponse.body?.value) {
      vscode.window.showErrorMessage('Failed to list resource groups.');
      return;
    }
    resourceGroups = rgResponse.body.value;
  } catch (error) {
    logger.error('Error listing resource groups', error);
    vscode.window.showErrorMessage('Failed to list resource groups.');
    return;
  }

  if (resourceGroups.length === 0) {
    vscode.window.showWarningMessage('No resource groups found in this subscription.');
    return;
  }

  const rgPick = await vscode.window.showQuickPick(
    resourceGroups.map((rg) => ({
      label: rg.name,
      description: rg.location,
    })),
    { placeHolder: 'Select a resource group', ignoreFocusOut: true },
  );

  if (!rgPick) {
    return;
  }

  const resourceGroup = rgPick.label;

  // Step 3: List Function Apps in the selected resource group
  let functionApps: FunctionAppSite[];
  try {
    const sitesResponse = await managementClient.get<{ value: FunctionAppSite[] }>(
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites?api-version=2023-01-01`,
    );
    if (sitesResponse.statusCode !== 200 || !sitesResponse.body?.value) {
      vscode.window.showErrorMessage('Failed to list Function Apps.');
      return;
    }
    functionApps = sitesResponse.body.value.filter(
      (site) => site.kind && site.kind.toLowerCase().includes('functionapp'),
    );
  } catch (error) {
    logger.error('Error listing Function Apps', error);
    vscode.window.showErrorMessage('Failed to list Function Apps.');
    return;
  }

  if (functionApps.length === 0) {
    vscode.window.showWarningMessage('No Function Apps found in this resource group.');
    return;
  }

  const appPick = await vscode.window.showQuickPick(
    functionApps.map((app) => ({
      label: app.name,
      description: `${app.location} — ${app.properties.state}`,
      detail: app.properties.defaultHostName,
    })),
    { placeHolder: 'Select a Function App', ignoreFocusOut: true },
  );

  if (!appPick) {
    return;
  }

  const functionAppName = appPick.label;

  // Step 4: Configure the AzureProvider via ProviderFactory
  const success = await providerFactory.switchToAzure(
    subscriptionId,
    resourceGroup,
    functionAppName,
    accessToken,
  );

  if (success) {
    vscode.window.showInformationMessage(
      `Connected to Function App "${functionAppName}"`,
    );
    connectionsTree.refresh();
    logger.info(`Selected Azure Function App: ${functionAppName}`);
  } else {
    vscode.window.showErrorMessage(
      `Failed to configure Function App "${functionAppName}".`,
    );
  }
}
