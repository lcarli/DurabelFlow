import * as vscode from 'vscode';

export interface ExtensionConfig {
  defaultEnvironment: 'local' | 'azure';
  localPort: number;
  pollingIntervalMs: number;
  maxInstances: number;
  taskHubName: string;
  storageProvider: 'AzureStorage' | 'Netherite' | 'MSSQL';
  showCodeLens: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('durableFunctionsUI');
  return {
    defaultEnvironment: cfg.get<'local' | 'azure'>('defaultEnvironment', 'local'),
    localPort: cfg.get<number>('localPort', 7071),
    pollingIntervalMs: cfg.get<number>('pollingIntervalMs', 2000),
    maxInstances: cfg.get<number>('maxInstances', 100),
    taskHubName: cfg.get<string>('taskHubName', ''),
    storageProvider: cfg.get<'AzureStorage' | 'Netherite' | 'MSSQL'>('storageProvider', 'AzureStorage'),
    showCodeLens: cfg.get<boolean>('showCodeLens', true),
    logLevel: cfg.get<'debug' | 'info' | 'warn' | 'error'>('logLevel', 'info'),
  };
}
