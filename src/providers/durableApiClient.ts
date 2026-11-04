import { HttpClient } from '../utils/httpClient';
import { Logger } from '../utils/logger';
import {
  OrchestrationInstance,
  OrchestrationFilter,
  PurgeHistoryResult,
} from '../models';

export class DurableApiClient {
  private client: HttpClient;
  private port: number;
  private taskHubName: string;
  private systemKey: string = '';
  private logger = Logger.getInstance();

  constructor(port: number = 7071, taskHubName: string = '') {
    this.port = port;
    this.taskHubName = taskHubName;
    this.client = new HttpClient(`http://localhost:${port}`);
  }

  updateConfig(port: number, taskHubName: string) {
    this.port = port;
    this.taskHubName = taskHubName;
    this.client.updateBaseUrl(`http://localhost:${port}`);
    this.systemKey = '';
  }

  updateBaseUrl(baseUrl: string) {
    this.client.updateBaseUrl(baseUrl);
  }

  /** Fetch the system key from the Core Tools admin API */
  async fetchSystemKey(): Promise<string> {
    if (this.systemKey) return this.systemKey;

    try {
      // Try /admin/host/systemkeys first
      const response = await this.client.get<Record<string, unknown>>('/admin/host/systemkeys');
      this.logger.debug(`systemkeys response (${response.statusCode})`);

      if (response.statusCode === 200 && response.body) {
        // Format 1: { keys: [{ name, value }] }
        const body = response.body as { keys?: { name: string; value: string }[] };
        if (Array.isArray(body.keys)) {
          const durableKey = body.keys.find(
            (k) => k.name === 'durabletask_extension',
          );
          if (durableKey) {
            this.systemKey = durableKey.value;
            this.logger.info('✅ Durable Task system key acquired');
            return this.systemKey;
          }
        }

        // Format 2: { durabletask_extension: "key_value" } (flat object)
        const flatBody = response.body as Record<string, string>;
        if (flatBody['durabletask_extension']) {
          this.systemKey = flatBody['durabletask_extension'];
          this.logger.info('✅ Durable Task system key acquired');
          return this.systemKey;
        }
      }
    } catch {
      // Host not reachable — silently return empty, will retry later
      return '';
    }

    // Fallback: try /admin/host/keys
    try {
      const response = await this.client.get<Record<string, unknown>>('/admin/host/keys');
      this.logger.debug(`host/keys response (${response.statusCode})`);

      if (response.statusCode === 200 && response.body) {
        const body = response.body as {
          masterKey?: string;
          systemKeys?: Record<string, string>;
        };

        if (body.systemKeys?.['durabletask_extension']) {
          this.systemKey = body.systemKeys['durabletask_extension'];
          this.logger.info('✅ Durable Task system key acquired');
          return this.systemKey;
        }

        // Last resort: use master key
        if (body.masterKey) {
          this.systemKey = body.masterKey;
          this.logger.info('✅ Using master key for Durable Task API');
          return this.systemKey;
        }
      }
    } catch {
      // Host not reachable
      return '';
    }

    this.logger.warn('⚠️ Host is reachable but no system key found — Durable Task API may return 404');
    return '';
  }

  private buildPath(endpoint: string): string {
    const base = '/runtime/webhooks/durableTask';
    const params: string[] = [];

    if (this.taskHubName) params.push(`taskHub=${encodeURIComponent(this.taskHubName)}`);
    if (this.systemKey) params.push(`code=${encodeURIComponent(this.systemKey)}`);

    const queryString = params.join('&');
    if (!queryString) return `${base}${endpoint}`;

    const separator = endpoint.includes('?') ? '&' : '?';
    return `${base}${endpoint}${separator}${queryString}`;
  }

  async startOrchestration(
    functionName: string,
    input?: unknown,
    instanceId?: string,
  ): Promise<OrchestrationInstance | null> {
    const idPart = instanceId ? `/${encodeURIComponent(instanceId)}` : '';
    const path = this.buildPath(`/orchestrators/${encodeURIComponent(functionName)}${idPart}`);

    try {
      const response = await this.client.post<OrchestrationInstance>(path, input);
      if (response.statusCode === 202 || response.statusCode === 200) {
        this.logger.info(`Started orchestration ${functionName}`, response.body);
        return response.body;
      }
      this.logger.warn(`Failed to start orchestration: ${response.statusCode}`);
      return null;
    } catch (error) {
      this.logger.error('Error starting orchestration', error);
      return null;
    }
  }

  async getInstanceStatus(
    instanceId: string,
    showHistory: boolean = false,
    showHistoryOutput: boolean = false,
    showInput: boolean = true,
  ): Promise<OrchestrationInstance | null> {
    // Ensure we have the system key
    if (!this.systemKey) {
      await this.fetchSystemKey();
    }

    const params = new URLSearchParams();
    if (showHistory) params.set('showHistory', 'true');
    if (showHistoryOutput) params.set('showHistoryOutput', 'true');
    if (showInput) params.set('showInput', 'true');

    const path = this.buildPath(`/instances/${encodeURIComponent(instanceId)}?${params.toString()}`);

    try {
      const response = await this.client.get<OrchestrationInstance>(path);
      this.logger.debug(`getInstanceStatus ${instanceId}: HTTP ${response.statusCode}`);
      // 200 = completed/terminated/failed, 202 = running/pending, both return instance data
      if (response.statusCode === 200 || response.statusCode === 202) {
        return response.body;
      }
      if (response.statusCode === 404) {
        return null;
      }
      this.logger.warn(`Unexpected status fetching instance: ${response.statusCode}`);
      return null;
    } catch (error) {
      this.logger.error('Error getting instance status', error);
      return null;
    }
  }

  async listInstances(filter?: OrchestrationFilter): Promise<OrchestrationInstance[]> {
    // Ensure we have the system key
    if (!this.systemKey) {
      await this.fetchSystemKey();
    }

    const params = new URLSearchParams();
    if (filter?.runtimeStatus?.length) {
      params.set('runtimeStatus', filter.runtimeStatus.join(','));
    }
    if (filter?.createdTimeFrom) params.set('createdTimeFrom', filter.createdTimeFrom);
    if (filter?.createdTimeTo) params.set('createdTimeTo', filter.createdTimeTo);
    if (filter?.top) params.set('top', filter.top.toString());
    if (filter?.showInput !== undefined) params.set('showInput', String(filter.showInput));

    const queryStr = params.toString();
    const path = this.buildPath(`/instances${queryStr ? '?' + queryStr : ''}`);

    try {
      const response = await this.client.get<OrchestrationInstance[]>(path);
      if ((response.statusCode === 200 || response.statusCode === 202) && Array.isArray(response.body)) {
        return response.body;
      }
      return [];
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== 'ECONNREFUSED') {
        this.logger.error('Error listing instances', error);
      }
      return [];
    }
  }

  async terminateInstance(instanceId: string, reason: string = ''): Promise<boolean> {
    const path = this.buildPath(
      `/instances/${encodeURIComponent(instanceId)}/terminate?reason=${encodeURIComponent(reason)}`,
    );

    try {
      const response = await this.client.post(path);
      return response.statusCode === 202;
    } catch (error) {
      this.logger.error('Error terminating instance', error);
      return false;
    }
  }

  async raiseEvent(instanceId: string, eventName: string, eventData?: unknown): Promise<boolean> {
    const path = this.buildPath(
      `/instances/${encodeURIComponent(instanceId)}/raiseEvent/${encodeURIComponent(eventName)}`,
    );

    try {
      const response = await this.client.post(path, eventData);
      return response.statusCode === 202;
    } catch (error) {
      this.logger.error('Error raising event', error);
      return false;
    }
  }

  async suspendInstance(instanceId: string, reason: string = ''): Promise<boolean> {
    const path = this.buildPath(
      `/instances/${encodeURIComponent(instanceId)}/suspend?reason=${encodeURIComponent(reason)}`,
    );

    try {
      const response = await this.client.post(path);
      return response.statusCode === 202;
    } catch (error) {
      this.logger.error('Error suspending instance', error);
      return false;
    }
  }

  async resumeInstance(instanceId: string, reason: string = ''): Promise<boolean> {
    const path = this.buildPath(
      `/instances/${encodeURIComponent(instanceId)}/resume?reason=${encodeURIComponent(reason)}`,
    );

    try {
      const response = await this.client.post(path);
      return response.statusCode === 202;
    } catch (error) {
      this.logger.error('Error resuming instance', error);
      return false;
    }
  }

  async purgeInstance(instanceId: string): Promise<boolean> {
    const path = this.buildPath(`/instances/${encodeURIComponent(instanceId)}`);

    try {
      const response = await this.client.delete<PurgeHistoryResult>(path);
      return response.statusCode === 200;
    } catch (error) {
      this.logger.error('Error purging instance', error);
      return false;
    }
  }

  async rewindInstance(instanceId: string, reason: string = ''): Promise<boolean> {
    const path = this.buildPath(
      `/instances/${encodeURIComponent(instanceId)}/rewind?reason=${encodeURIComponent(reason)}`,
    );

    try {
      const response = await this.client.post(path);
      return response.statusCode === 202;
    } catch (error) {
      this.logger.error('Error rewinding instance', error);
      return false;
    }
  }
}
