import { AzureFunction } from '../models';

export interface IFunctionProvider {
  /** List all functions in the function app */
  listFunctions(): Promise<AzureFunction[]>;

  /** Check if the function host is running and reachable */
  isHostRunning(): Promise<boolean>;

  /** Get the base URL of the function host */
  getBaseUrl(): string;

  /** Trigger an HTTP function */
  triggerHttpFunction(
    functionName: string,
    method: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ statusCode: number; body: unknown }>;
}
