// Minimal VSCode API mock for unit testing

export class EventEmitter {
  private listeners: Function[] = [];
  event = (listener: Function) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data?: unknown) { this.listeners.forEach(l => l(data)); }
  dispose() { this.listeners = []; }
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  iconPath?: ThemeIcon;
  contextValue?: string;
  collapsibleState?: TreeItemCollapsibleState;
  command?: unknown;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class Uri {
  static file(path: string) { return { fsPath: path, scheme: 'file' }; }
  static joinPath(base: any, ...segments: string[]) {
    return { fsPath: base.fsPath + '/' + segments.join('/') };
  }
}

export const window = {
  createOutputChannel: (name: string) => ({
    appendLine: (_msg: string) => {},
    show: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  showInputBox: async (_opts?: unknown) => undefined,
  showQuickPick: async (_items: unknown[], _opts?: unknown) => undefined,
  createTerminal: (_opts?: unknown) => ({
    show: () => {},
    sendText: (_text: string) => {},
    dispose: () => {},
  }),
  onDidCloseTerminal: (_callback: Function) => ({ dispose: () => {} }),
  registerTreeDataProvider: (_id: string, _provider: unknown) => ({ dispose: () => {} }),
};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue,
  }),
  findFiles: async (_include: unknown, _exclude?: unknown, _maxResults?: number) => [],
  openTextDocument: async (_options?: unknown) => ({}),
  onDidChangeConfiguration: (_callback: Function) => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: (_id: string, _handler: Function) => ({ dispose: () => {} }),
  executeCommand: async (_id: string, ..._args: unknown[]) => {},
};
