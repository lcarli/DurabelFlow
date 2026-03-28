import { ILanguageAnalyzer, DetectedFunction } from './ILanguageAnalyzer';

/**
 * Detects Durable Functions in Python files.
 *
 * Supports both v1 (function.json) and v2 (blueprint/decorator) models.
 */
export class PythonAnalyzer implements ILanguageAnalyzer {
  readonly supportedExtensions = ['.py'];
  readonly languageId = 'python';

  analyzeFile(filePath: string, content: string): DetectedFunction[] {
    const functions: DetectedFunction[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // v2: @bp.orchestration_trigger / @app.orchestration_trigger
      const orchDecoratorMatch = line.match(
        /@\w+\.(?:orchestration_trigger|route.*orchestration)/,
      );
      if (orchDecoratorMatch) {
        const funcName = this.findPythonFuncName(lines, i);
        if (funcName) {
          const callsTo = this.extractCallsFromBlock(lines, i);
          functions.push({
            name: funcName,
            type: 'orchestrator',
            filePath,
            line: i,
            column: 0,
            callsTo,
            language: 'python',
          });
        }
        continue;
      }

      // v1: main = df.Orchestrator.create(orchestrator_function)
      const v1OrchMatch = line.match(/=\s*df\.Orchestrator\.create\s*\(\s*(\w+)\s*\)/);
      if (v1OrchMatch) {
        const name = this.inferFunctionName(filePath);
        const callsTo = this.extractCallsFromContent(content);
        functions.push({
          name,
          type: 'orchestrator',
          filePath,
          line: i,
          column: 0,
          callsTo,
          language: 'python',
        });
        continue;
      }

      // v2: @bp.activity_trigger
      const actDecoratorMatch = line.match(/@\w+\.activity_trigger/);
      if (actDecoratorMatch) {
        const funcName = this.findPythonFuncName(lines, i);
        if (funcName) {
          functions.push({
            name: funcName,
            type: 'activity',
            filePath,
            line: i,
            column: 0,
            callsTo: [],
            language: 'python',
          });
        }
        continue;
      }

      // v2: @bp.entity_trigger
      const entityDecoratorMatch = line.match(/@\w+\.entity_trigger/);
      if (entityDecoratorMatch) {
        const funcName = this.findPythonFuncName(lines, i);
        if (funcName) {
          functions.push({
            name: funcName,
            type: 'entity',
            filePath,
            line: i,
            column: 0,
            callsTo: [],
            language: 'python',
          });
        }
        continue;
      }

      // Detect durable client starter pattern
      const clientMatch = line.match(/DurableOrchestrationClient\s*\(/);
      if (clientMatch) {
        const funcName = this.findPythonFuncNameBefore(lines, i);
        const startsTo = this.extractStartNewFromContent(content);
        functions.push({
          name: funcName || this.inferFunctionName(filePath),
          type: 'durableClient',
          filePath,
          line: i,
          column: 0,
          callsTo: startsTo,
          language: 'python',
        });
      }
    }

    return functions;
  }

  private findPythonFuncName(lines: string[], decoratorLine: number): string | null {
    for (let i = decoratorLine + 1; i < Math.min(lines.length, decoratorLine + 5); i++) {
      const match = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return null;
  }

  private findPythonFuncNameBefore(lines: string[], line: number): string | null {
    for (let i = line; i >= Math.max(0, line - 10); i--) {
      const match = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
      if (match) return match[1];
    }
    return null;
  }

  private extractCallsFromBlock(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 100);

    for (let i = startLine; i < end; i++) {
      const actMatch = lines[i].match(/call_activity\s*\(\s*['"]([^'"]+)['"]/);
      if (actMatch && !calls.includes(actMatch[1])) calls.push(actMatch[1]);

      const subMatch = lines[i].match(/call_sub_orchestrator\s*\(\s*['"]([^'"]+)['"]/);
      if (subMatch && !calls.includes(subMatch[1])) calls.push(subMatch[1]);

      const eventMatch = lines[i].match(/wait_for_external_event\s*\(\s*['"]([^'"]+)['"]/);
      if (eventMatch && !calls.includes(`event:${eventMatch[1]}`)) {
        calls.push(`event:${eventMatch[1]}`);
      }
    }

    return calls;
  }

  private extractCallsFromContent(content: string): string[] {
    const calls: string[] = [];

    const actMatches = content.matchAll(/call_activity\s*\(\s*['"]([^'"]+)['"]/g);
    for (const m of actMatches) {
      if (!calls.includes(m[1])) calls.push(m[1]);
    }

    const subMatches = content.matchAll(/call_sub_orchestrator\s*\(\s*['"]([^'"]+)['"]/g);
    for (const m of subMatches) {
      if (!calls.includes(m[1])) calls.push(m[1]);
    }

    return calls;
  }

  private extractStartNewFromContent(content: string): string[] {
    const calls: string[] = [];
    const matches = content.matchAll(/start_new\s*\(\s*['"]([^'"]+)['"]/g);
    for (const m of matches) {
      if (!calls.includes(m[1])) calls.push(m[1]);
    }
    return calls;
  }

  private inferFunctionName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    // Python v1: folder name is function name
    if (parts.length >= 2 && parts[parts.length - 1] === '__init__.py') {
      return parts[parts.length - 2];
    }
    return parts[parts.length - 1].replace(/\.py$/, '');
  }
}
