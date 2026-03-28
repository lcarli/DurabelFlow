import * as vscode from 'vscode';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel;
  private level: keyof typeof LOG_LEVELS = 'info';

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('DurableFlow');
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLevel(level: keyof typeof LOG_LEVELS) {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args);
  }

  show() {
    this.outputChannel.show();
  }

  private log(level: keyof typeof LOG_LEVELS, message: string, ...args: unknown[]) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const formattedArgs = args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
    this.outputChannel.appendLine(`${prefix} ${message}${formattedArgs}`);
  }

  dispose() {
    this.outputChannel.dispose();
  }
}
