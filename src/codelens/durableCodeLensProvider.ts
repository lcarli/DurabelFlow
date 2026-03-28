import * as vscode from 'vscode';
import { AnalyzerService } from '../analyzers';
import { Logger } from '../utils/logger';

export class DurableCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private analyzerService: AnalyzerService) {}

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const functions = this.analyzerService.analyzeFile(document.uri.fsPath, document.getText());
    const codeLenses: vscode.CodeLens[] = [];

    for (const fn of functions) {
      const range = new vscode.Range(fn.line, fn.column, fn.line, fn.column + fn.name.length);

      if (fn.type === 'orchestrator') {
        // ▶ Start Orchestration
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '▶ Start Orchestration',
            command: 'durableFunctionsUI.startOrchestrationByName',
            arguments: [fn.name],
            tooltip: `Start orchestration "${fn.name}"`,
          }),
        );

        // 📊 Show Flow
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '📊 Show Flow',
            command: 'durableFunctionsUI.showDesignFlow',
            arguments: [fn],
            tooltip: `Show visual flow for "${fn.name}"`,
          }),
        );

        // References count
        if (fn.callsTo.length > 0) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `⚡ calls ${fn.callsTo.filter((c) => !c.startsWith('event:')).length} activities`,
              command: '',
              tooltip: fn.callsTo.join(', '),
            }),
          );
        }
      } else if (fn.type === 'activity') {
        // Show how many orchestrators call this activity
        const callers = this.analyzerService.findCallers(fn.name);
        if (callers.length > 0) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `🎭 ${callers.length} orchestrator${callers.length > 1 ? 's' : ''} call this`,
              command: 'durableFunctionsUI.showCallers',
              arguments: [fn.name, callers],
              tooltip: callers.map((c) => c.name).join(', '),
            }),
          );
        }

        // ▶ Trigger (if directly invocable)
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '⚡ Activity',
            command: '',
            tooltip: `Activity function "${fn.name}"`,
          }),
        );
      } else if (fn.type === 'entity') {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '📦 Entity',
            command: '',
            tooltip: `Entity function "${fn.name}"`,
          }),
        );
      } else if (fn.type === 'durableClient') {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '🚀 Durable Client',
            command: '',
            tooltip: fn.callsTo.length > 0
              ? `Starts: ${fn.callsTo.join(', ')}`
              : 'Durable client starter',
          }),
        );
      } else if (fn.type === 'httpTrigger') {
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '▶ Trigger',
            command: 'durableFunctionsUI.triggerFunctionByName',
            arguments: [fn.name],
            tooltip: `Trigger HTTP function "${fn.name}"`,
          }),
        );
      }
    }

    return codeLenses;
  }
}

/**
 * Provides "Go to Definition" for activity names referenced inside orchestrators.
 */
export class DurableDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private analyzerService: AnalyzerService) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Definition | undefined {
    const line = document.lineAt(position.line).text;
    const logger = Logger.getInstance();

    // Extract quoted string at cursor position
    const quotedName = this.getQuotedStringAtPosition(line, position.character);
    if (!quotedName) return undefined;

    // Find the function definition
    const target = this.analyzerService.findFunctionByName(quotedName);
    if (!target) return undefined;

    logger.debug(`Go to definition: ${quotedName} → ${target.filePath}:${target.line}`);

    return new vscode.Location(
      vscode.Uri.file(target.filePath),
      new vscode.Position(target.line, target.column),
    );
  }

  private getQuotedStringAtPosition(line: string, col: number): string | null {
    // Find quoted strings in the line and check if cursor is inside one
    const regex = /['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const start = match.index + 1;
      const end = start + match[1].length;
      if (col >= start && col <= end) {
        return match[1];
      }
    }
    return null;
  }
}

/**
 * Provides hover information for Durable Functions.
 */
export class DurableHoverProvider implements vscode.HoverProvider {
  constructor(private analyzerService: AnalyzerService) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;

    const quotedName = this.getQuotedStringAtPosition(line, position.character);
    if (!quotedName) return undefined;

    const fn = this.analyzerService.findFunctionByName(quotedName);
    if (!fn) return undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${fn.name}** — _${fn.type}_\n\n`);
    md.appendMarkdown(`📄 \`${fn.filePath.split(/[/\\]/).pop()}\` (line ${fn.line + 1})\n\n`);

    if (fn.type === 'orchestrator' && fn.callsTo.length > 0) {
      md.appendMarkdown(`**Calls:**\n`);
      for (const call of fn.callsTo) {
        if (call.startsWith('event:')) {
          md.appendMarkdown(`- 📨 Event: \`${call.replace('event:', '')}\`\n`);
        } else {
          md.appendMarkdown(`- ⚡ \`${call}\`\n`);
        }
      }
    }

    if (fn.type === 'activity') {
      const callers = this.analyzerService.findCallers(fn.name);
      if (callers.length > 0) {
        md.appendMarkdown(`**Called by:**\n`);
        for (const caller of callers) {
          md.appendMarkdown(`- 🎭 \`${caller.name}\`\n`);
        }
      }
    }

    return new vscode.Hover(md);
  }

  private getQuotedStringAtPosition(line: string, col: number): string | null {
    const regex = /['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const start = match.index + 1;
      const end = start + match[1].length;
      if (col >= start && col <= end) {
        return match[1];
      }
    }
    return null;
  }
}
