import { HttpClient } from '../utils/httpClient';
import { AzureFunction, FunctionBinding, classifyFunctionType } from '../models';
import { IFunctionProvider } from './IFunctionProvider';
import { Logger } from '../utils/logger';

interface AdminFunctionInfo {
  name: string;
  config?: {
    bindings?: FunctionBinding[];
  };
  language?: string;
}

export class LocalProvider implements IFunctionProvider {
  private client: HttpClient;
  private port: number;
  private logger = Logger.getInstance();

  constructor(port: number = 7071) {
    this.port = port;
    this.client = new HttpClient(`http://localhost:${port}`);
  }

  updatePort(port: number) {
    this.port = port;
    this.client.updateBaseUrl(`http://localhost:${port}`);
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  async isHostRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/admin/host/status');
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  async listFunctions(): Promise<AzureFunction[]> {
    try {
      const response = await this.client.get<AdminFunctionInfo[]>('/admin/functions');
      if (response.statusCode !== 200 || !Array.isArray(response.body)) {
        this.logger.warn('Failed to list functions', response.statusCode);
        return [];
      }

      return response.body.map((fn) => {
        const bindings = fn.config?.bindings ?? [];
        return {
          name: fn.name,
          type: classifyFunctionType(bindings),
          language: fn.language,
          bindings,
        };
      });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code !== 'ECONNREFUSED') {
        this.logger.error('Error listing functions', error);
      }
      return [];
    }
  }

  async triggerHttpFunction(
    functionName: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ statusCode: number; body: unknown }> {
    const path = `/api/${functionName}`;
    const response =
      method.toUpperCase() === 'GET'
        ? await this.client.get(path, headers)
        : await this.client.post(path, body, headers);

    return { statusCode: response.statusCode, body: response.body };
  }
}
