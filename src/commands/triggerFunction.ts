import * as vscode from 'vscode';
import { CommandContext } from './index';
import { FunctionTreeItem } from '../views/functionsTreeView';
import { Logger } from '../utils/logger';

export async function triggerFunction(ctx: CommandContext, item?: FunctionTreeItem) {
  const logger = Logger.getInstance();

  let functionName: string | undefined;

  if (item?.func) {
    functionName = item.func.name;
  } else {
    const functions = await ctx.localProvider.listFunctions();
    const httpFunctions = functions.filter((f) => f.type === 'httpTrigger');

    if (httpFunctions.length === 0) {
      vscode.window.showWarningMessage('No HTTP trigger functions found.');
      return;
    }

    functionName = await vscode.window.showQuickPick(
      httpFunctions.map((f) => f.name),
      { placeHolder: 'Select a function to trigger' },
    );
  }

  if (!functionName) return;

  const method = await vscode.window.showQuickPick(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], {
    placeHolder: 'HTTP Method',
  });

  if (!method) return;

  let body: unknown = undefined;
  if (method !== 'GET') {
    const bodyStr = await vscode.window.showInputBox({
      prompt: 'Request body JSON (leave empty for no body)',
      placeHolder: '{"key": "value"}',
      validateInput: (value) => {
        if (!value) return null;
        try {
          JSON.parse(value);
          return null;
        } catch {
          return 'Invalid JSON';
        }
      },
    });

    if (bodyStr === undefined) return;
    body = bodyStr ? JSON.parse(bodyStr) : undefined;
  }

  try {
    const result = await ctx.localProvider.triggerHttpFunction(functionName, method, body);

    const doc = await vscode.workspace.openTextDocument({
      content: [
        `// ${method} /api/${functionName}`,
        `// Status: ${result.statusCode}`,
        '',
        typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2),
      ].join('\n'),
      language: 'jsonc',
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    logger.info(`Triggered ${method} /api/${functionName} → ${result.statusCode}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to trigger function: ${error}`);
  }
}
