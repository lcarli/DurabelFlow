import * as vscode from 'vscode';
import { IFunctionProvider } from '../providers/IFunctionProvider';
import { AzureFunction, FunctionType } from '../models';

export class FunctionsTreeProvider implements vscode.TreeDataProvider<FunctionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FunctionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private functions: AzureFunction[] = [];

  constructor(private provider: IFunctionProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FunctionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FunctionTreeItem): Promise<FunctionTreeItem[]> {
    if (element) {
      return [];
    }

    try {
      this.functions = await this.provider.listFunctions();
    } catch {
      this.functions = [];
    }

    if (this.functions.length === 0) {
      return [];
    }

    // Group by type
    const groups = new Map<FunctionType, AzureFunction[]>();
    for (const fn of this.functions) {
      const list = groups.get(fn.type) || [];
      list.push(fn);
      groups.set(fn.type, list);
    }

    const items: FunctionTreeItem[] = [];

    const typeOrder: FunctionType[] = [
      'orchestrator',
      'activity',
      'entity',
      'durableClient',
      'httpTrigger',
      'other',
    ];

    for (const type of typeOrder) {
      const fns = groups.get(type);
      if (!fns?.length) continue;

      for (const fn of fns) {
        items.push(new FunctionTreeItem(fn));
      }
    }

    return items;
  }
}

const TYPE_ICONS: Record<FunctionType, string> = {
  orchestrator: 'symbol-event',
  activity: 'zap',
  entity: 'database',
  durableClient: 'rocket',
  httpTrigger: 'globe',
  other: 'symbol-method',
};

const TYPE_LABELS: Record<FunctionType, string> = {
  orchestrator: 'Orchestrator',
  activity: 'Activity',
  entity: 'Entity',
  durableClient: 'Client',
  httpTrigger: 'HTTP',
  other: 'Function',
};

export class FunctionTreeItem extends vscode.TreeItem {
  constructor(public readonly func: AzureFunction) {
    super(func.name, vscode.TreeItemCollapsibleState.None);

    this.description = TYPE_LABELS[func.type];
    this.contextValue = func.type;
    this.iconPath = new vscode.ThemeIcon(TYPE_ICONS[func.type]);

    if (func.type === 'orchestrator') {
      this.tooltip = `${func.name} (Orchestrator)\nClick ▶ to start orchestration`;
    } else if (func.type === 'httpTrigger') {
      this.tooltip = `${func.name} (HTTP Trigger)\nClick ⚡ to trigger`;
    } else {
      this.tooltip = `${func.name} (${TYPE_LABELS[func.type]})`;
    }
  }
}
