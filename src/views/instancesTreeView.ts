import * as vscode from 'vscode';
import { DurableApiClient } from '../providers/durableApiClient';
import { OrchestrationInstance, OrchestrationRuntimeStatus } from '../models';
import { ExtensionConfig } from '../utils/config';

export class InstancesTreeProvider implements vscode.TreeDataProvider<InstanceTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<InstanceTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private config: ExtensionConfig;
  private pollingTimer?: ReturnType<typeof setInterval>;

  constructor(
    private durableClient: DurableApiClient,
    config: ExtensionConfig,
  ) {
    this.config = config;
  }

  updateConfig(config: ExtensionConfig) {
    this.config = config;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.pollingTimer = setInterval(() => {
      this.refresh();
    }, this.config.pollingIntervalMs);
  }

  stopAutoRefresh() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  getTreeItem(element: InstanceTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: InstanceTreeItem): Promise<InstanceTreeItem[]> {
    if (element) {
      return [];
    }

    try {
      const instances = await this.durableClient.listInstances({
        top: this.config.maxInstances,
        showInput: false,
      });

      return instances.map((instance) => new InstanceTreeItem(instance));
    } catch {
      return [];
    }
  }

  dispose() {
    this.stopAutoRefresh();
    this._onDidChangeTreeData.dispose();
  }
}

const STATUS_ICONS: Record<OrchestrationRuntimeStatus, string> = {
  Running: 'sync~spin',
  Completed: 'pass',
  Failed: 'error',
  Terminated: 'circle-slash',
  Pending: 'clock',
  Suspended: 'debug-pause',
  ContinuedAsNew: 'debug-restart',
  Canceled: 'circle-slash',
};

export class InstanceTreeItem extends vscode.TreeItem {
  constructor(public readonly instance: OrchestrationInstance) {
    super(instance.name, vscode.TreeItemCollapsibleState.None);

    const status = instance.runtimeStatus;
    this.description = `${status} — ${instance.instanceId.substring(0, 8)}...`;
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[status] ?? 'question');

    // Context value for menus
    const isRunning = status === 'Running' || status === 'Pending' || status === 'Suspended';
    this.contextValue = isRunning ? 'runningInstance' : 'completedInstance';

    const created = new Date(instance.createdTime).toLocaleString();
    const updated = new Date(instance.lastUpdatedTime).toLocaleString();
    this.tooltip = [
      `Name: ${instance.name}`,
      `Instance ID: ${instance.instanceId}`,
      `Status: ${status}`,
      `Created: ${created}`,
      `Last Updated: ${updated}`,
    ].join('\n');
  }
}
