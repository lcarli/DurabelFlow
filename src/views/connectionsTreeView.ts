import * as vscode from 'vscode';
import { ExtensionConfig } from '../utils/config';

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private config: ExtensionConfig;

  constructor(config: ExtensionConfig) {
    this.config = config;
  }

  updateConfig(config: ExtensionConfig) {
    this.config = config;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (element) {
      return [];
    }

    const items: ConnectionTreeItem[] = [];

    // Environment info
    const envIcon = this.config.defaultEnvironment === 'local' ? 'vm' : 'cloud';
    items.push(
      new ConnectionTreeItem(
        `Environment: ${this.config.defaultEnvironment}`,
        new vscode.ThemeIcon(envIcon),
        `Currently targeting ${this.config.defaultEnvironment} environment`,
      ),
    );

    // Connection details
    if (this.config.defaultEnvironment === 'local') {
      items.push(
        new ConnectionTreeItem(
          `Port: ${this.config.localPort}`,
          new vscode.ThemeIcon('plug'),
          `http://localhost:${this.config.localPort}`,
        ),
      );
    }

    // Storage provider
    items.push(
      new ConnectionTreeItem(
        `Storage: ${this.config.storageProvider}`,
        new vscode.ThemeIcon('database'),
        `Durable Task storage provider: ${this.config.storageProvider}`,
      ),
    );

    // Task Hub
    const hubName = this.config.taskHubName || '(auto-detect)';
    items.push(
      new ConnectionTreeItem(
        `Task Hub: ${hubName}`,
        new vscode.ThemeIcon('symbol-namespace'),
        `Task Hub name: ${hubName}`,
      ),
    );

    return items;
  }
}

export class ConnectionTreeItem extends vscode.TreeItem {
  constructor(label: string, icon: vscode.ThemeIcon, tooltip: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = icon;
    this.tooltip = tooltip;
    this.contextValue = 'connection';
  }
}
