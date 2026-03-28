import * as vscode from 'vscode';

/**
 * Opens a temporary JSON document for the user to edit, then returns the parsed content.
 * Provides full syntax highlighting, multiline editing, and validation.
 *
 * @param title Description shown in the document header comment
 * @param defaultValue Default JSON value to pre-fill
 * @returns Parsed JSON value, or `undefined` if cancelled
 */
export async function promptForJson(
  title: string,
  defaultValue?: unknown,
): Promise<unknown | undefined> {
  const header = `// ${title}\n// Edit the JSON below, then save and close this tab (Ctrl+W) to continue.\n// Close without saving to cancel.\n\n`;

  const defaultContent =
    defaultValue !== undefined && defaultValue !== null
      ? JSON.stringify(defaultValue, null, 2)
      : '{\n  \n}';

  const doc = await vscode.workspace.openTextDocument({
    content: header + defaultContent,
    language: 'jsonc',
  });

  const editor = await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });

  // Place cursor inside the JSON (after the header comments)
  const startLine = header.split('\n').length - 1;
  const pos = new vscode.Position(startLine + 1, 2);
  editor.selection = new vscode.Selection(pos, pos);

  // Wait for the document to be closed
  return new Promise<unknown | undefined>((resolve) => {
    const disposables: vscode.Disposable[] = [];

    // Resolve when the tab is closed
    disposables.push(
      vscode.workspace.onDidCloseTextDocument((closedDoc) => {
        if (closedDoc === doc) {
          cleanup();
          // Get the final content (strip header comments)
          const fullText = closedDoc.getText();
          const jsonText = stripCommentHeader(fullText);

          if (!jsonText.trim()) {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(jsonText));
          } catch {
            // If invalid JSON, try returning as raw string
            resolve(jsonText.trim());
          }
        }
      }),
    );

    function cleanup() {
      disposables.forEach((d) => d.dispose());
    }
  });
}

/**
 * Simplified prompt: opens an InputBox for small JSON payloads,
 * or a full editor for larger ones. User chooses.
 */
export async function promptForJsonSmart(
  title: string,
  defaultValue?: unknown,
): Promise<{ value: unknown | undefined; cancelled: boolean }> {
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: '$(edit) Quick Input',
        description: 'Single-line JSON input',
        value: 'quick' as const,
      },
      {
        label: '$(file-code) JSON Editor',
        description: 'Full editor with syntax highlighting',
        value: 'editor' as const,
      },
    ],
    { placeHolder: `${title} — choose input mode` },
  );

  if (!mode) return { value: undefined, cancelled: true };

  if (mode.value === 'quick') {
    const defaultStr =
      defaultValue !== undefined && defaultValue !== null
        ? JSON.stringify(defaultValue)
        : '';

    const inputStr = await vscode.window.showInputBox({
      prompt: `${title} (leave empty for null)`,
      placeHolder: '{"key": "value"}',
      value: defaultStr,
      validateInput: (val) => {
        if (!val) return null;
        try {
          JSON.parse(val);
          return null;
        } catch {
          return 'Invalid JSON';
        }
      },
    });

    if (inputStr === undefined) return { value: undefined, cancelled: true };
    return { value: inputStr ? JSON.parse(inputStr) : null, cancelled: false };
  }

  // Full editor mode
  const result = await promptForJson(title, defaultValue);
  return { value: result, cancelled: false };
}

/**
 * Prompt for HTTP headers using the JSON editor.
 */
export async function promptForHeaders(
  defaultHeaders?: Record<string, string>,
): Promise<Record<string, string> | undefined> {
  const defaults = defaultHeaders ?? { 'Content-Type': 'application/json' };

  const result = await promptForJson('HTTP Headers', defaults);
  if (result === undefined) return undefined;

  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return result as Record<string, string>;
  }

  return defaults;
}

function stripCommentHeader(text: string): string {
  const lines = text.split('\n');
  const jsonStart = lines.findIndex((line) => !line.trimStart().startsWith('//') && line.trim() !== '');
  if (jsonStart < 0) return '';
  return lines.slice(jsonStart).join('\n');
}
