import * as vscode from 'vscode';
import { CommandContext } from './index';
import { Logger } from '../utils/logger';

let coreToolsTerminal: vscode.Terminal | undefined;

export async function startCoreTools(ctx: CommandContext) {
  const logger = Logger.getInstance();

  if (coreToolsTerminal) {
    const action = await vscode.window.showWarningMessage(
      'Azure Functions Core Tools is already running.',
      'Show Terminal',
      'Restart',
    );
    if (action === 'Show Terminal') {
      coreToolsTerminal.show();
      return;
    } else if (action === 'Restart') {
      coreToolsTerminal.dispose();
      coreToolsTerminal = undefined;
    } else {
      return;
    }
  }

  // Find the project root (folder containing host.json)
  const hostJsonFiles = await vscode.workspace.findFiles('**/host.json', '**/node_modules/**', 1);

  if (hostJsonFiles.length === 0) {
    vscode.window.showErrorMessage('No host.json found. Is this an Azure Functions project?');
    return;
  }

  const projectDir = vscode.Uri.joinPath(hostJsonFiles[0], '..');

  coreToolsTerminal = vscode.window.createTerminal({
    name: 'Azure Functions',
    cwd: projectDir,
    iconPath: new vscode.ThemeIcon('azure'),
  });

  coreToolsTerminal.show();
  coreToolsTerminal.sendText(`func host start --port ${ctx.config.localPort}`);

  // Listen for terminal close
  const disposable = vscode.window.onDidCloseTerminal((terminal) => {
    if (terminal === coreToolsTerminal) {
      coreToolsTerminal = undefined;
      disposable.dispose();
      logger.info('Core Tools terminal closed');
    }
  });

  logger.info(`Starting Core Tools on port ${ctx.config.localPort}`);

  // Wait a bit then refresh
  setTimeout(() => {
    vscode.commands.executeCommand('durableFunctionsUI.refreshFunctions');
  }, 5000);
}

export async function stopCoreTools() {
  const logger = Logger.getInstance();

  if (!coreToolsTerminal) {
    vscode.window.showInformationMessage('Azure Functions Core Tools is not running.');
    return;
  }

  coreToolsTerminal.dispose();
  coreToolsTerminal = undefined;
  logger.info('Core Tools stopped');

  vscode.window.showInformationMessage('Azure Functions Core Tools stopped.');
}
