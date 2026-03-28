import { IFunctionProvider } from './IFunctionProvider';
import { AzureFunction, FunctionBinding, classifyFunctionType } from '../models';
import { HttpClient } from '../utils/httpClient';
import { Logger } from '../utils/logger';

interface AzureFunctionEnvelope {
  id: string;
  name: string;
  properties: {
    name: string;
    config: {
      bindings?: FunctionBinding[];
    };
    language?: string;
    invoke_url_template?: string;
  };
}

/**
 * Provider for Azure-hosted Function Apps.
 *
 * Uses Azure Management REST API and the Durable Task HTTP API
 * proxied through the Function App's host.
 */
export class AzureProvider implements IFunctionProvider {
  private managementClient: HttpClient;
  private functionHostClient: HttpClient | null = null;
  private logger = Logger.getInstance();
  private hostName: string = '';
  private defaultKey: string = '';

  private subscriptionId: string = '';
  private resourceGroup: string = '';
  private functionAppName: string = '';

  constructor() {
    this.managementClient = new HttpClient('https://management.azure.com', {
      'Content-Type': 'application/json',
    });
  }

  /** Configure the provider to target a specific Function App */
  async configure(
    subscriptionId: string,
    resourceGroup: string,
    functionAppName: string,
    accessToken: string,
  ): Promise<boolean> {
    this.subscriptionId = subscriptionId;
    this.resourceGroup = resourceGroup;
    this.functionAppName = functionAppName;

    this.managementClient = new HttpClient('https://management.azure.com', {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    });

    try {
      // Get the function app details
      const appResponse = await this.managementClient.get<{
        properties: { defaultHostName: string; state: string };
      }>(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${functionAppName}?api-version=2023-01-01`,
      );

      if (appResponse.statusCode !== 200) {
        this.logger.error('Failed to get function app details', appResponse.statusCode);
        return false;
      }

      this.hostName = appResponse.body.properties.defaultHostName;

      // Get the default host key for Durable Task API access
      const keysResponse = await this.managementClient.post<{
        functionKeys?: Record<string, string>;
        masterKey?: string;
        systemKeys?: Record<string, string>;
      }>(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${functionAppName}/host/default/listkeys?api-version=2023-01-01`,
      );

      if (keysResponse.statusCode === 200 && keysResponse.body) {
        this.defaultKey =
          keysResponse.body.functionKeys?.['default'] ||
          keysResponse.body.masterKey ||
          '';
      }

      // Create function host client
      this.functionHostClient = new HttpClient(`https://${this.hostName}`, {
        'Content-Type': 'application/json',
        'x-functions-key': this.defaultKey,
      });

      this.logger.info(`Configured Azure Provider for ${functionAppName} (${this.hostName})`);
      return true;
    } catch (error) {
      this.logger.error('Failed to configure Azure Provider', error);
      return false;
    }
  }

  getBaseUrl(): string {
    return this.hostName ? `https://${this.hostName}` : '';
  }

  async isHostRunning(): Promise<boolean> {
    if (!this.functionHostClient) return false;

    try {
      const response = await this.functionHostClient.get('/admin/host/status');
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  async listFunctions(): Promise<AzureFunction[]> {
    if (!this.subscriptionId) return [];

    try {
      const response = await this.managementClient.get<{ value: AzureFunctionEnvelope[] }>(
        `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Web/sites/${this.functionAppName}/functions?api-version=2023-01-01`,
      );

      if (response.statusCode !== 200 || !response.body?.value) {
        return [];
      }

      return response.body.value.map((fn) => {
        const bindings = fn.properties.config?.bindings ?? [];
        return {
          name: fn.properties.name,
          type: classifyFunctionType(bindings),
          language: fn.properties.language,
          bindings,
        };
      });
    } catch (error) {
      this.logger.error('Error listing Azure functions', error);
      return [];
    }
  }

  async triggerHttpFunction(
    functionName: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ statusCode: number; body: unknown }> {
    if (!this.functionHostClient) {
      throw new Error('Azure Provider not configured');
    }

    const path = `/api/${functionName}`;
    const allHeaders = { ...headers, 'x-functions-key': this.defaultKey };

    const response =
      method.toUpperCase() === 'GET'
        ? await this.functionHostClient.get(path, allHeaders)
        : await this.functionHostClient.post(path, body, allHeaders);

    return { statusCode: response.statusCode, body: response.body };
  }

  /** Get info about the configured function app */
  getConnectionInfo() {
    return {
      subscriptionId: this.subscriptionId,
      resourceGroup: this.resourceGroup,
      functionAppName: this.functionAppName,
      hostName: this.hostName,
      isConfigured: !!this.hostName,
    };
  }

  /** Get the Azure Portal URL for this function app */
  getPortalUrl(): string {
    if (!this.subscriptionId) return '';
    return `https://portal.azure.com/#@/resource/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Web/sites/${this.functionAppName}/functionsList`;
  }

  /** Get the Azure Portal URL for a specific orchestration instance */
  getInstancePortalUrl(instanceId: string): string {
    const baseUrl = this.getPortalUrl();
    return baseUrl ? `${baseUrl}?instanceId=${instanceId}` : '';
  }
}
