import { ILanguageAnalyzer, DetectedFunction } from './ILanguageAnalyzer';

/**
 * Detects Durable Functions in TypeScript/JavaScript files.
 *
 * Supports both v4 programming model (df.app.orchestration / df.app.activity)
 * and v3 model (context.df.callActivity patterns).
 */
export class TypeScriptAnalyzer implements ILanguageAnalyzer {
  readonly supportedExtensions = ['.ts', '.js', '.mts', '.mjs'];
  readonly languageId = 'typescript';

  analyzeFile(filePath: string, content: string): DetectedFunction[] {
    const functions: DetectedFunction[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // v4 model: df.app.orchestration('name', handler)
      const orchMatch = line.match(/df\.app\.orchestration\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (orchMatch) {
        const callsTo = this.extractCallsFromOrchestrator(content, orchMatch[1]);
        functions.push({
          name: orchMatch[1],
          type: 'orchestrator',
          filePath,
          line: i,
          column: line.indexOf(orchMatch[0]),
          callsTo,
          language: 'typescript',
        });
        continue;
      }

      // v4 model: df.app.activity('name', { handler })
      const actMatch = line.match(/df\.app\.activity\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (actMatch) {
        functions.push({
          name: actMatch[1],
          type: 'activity',
          filePath,
          line: i,
          column: line.indexOf(actMatch[0]),
          callsTo: [],
          language: 'typescript',
        });
        continue;
      }

      // v4 model: df.app.entity('name', handler)
      const entityMatch = line.match(/df\.app\.entity\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (entityMatch) {
        functions.push({
          name: entityMatch[1],
          type: 'entity',
          filePath,
          line: i,
          column: line.indexOf(entityMatch[0]),
          callsTo: [],
          language: 'typescript',
        });
        continue;
      }

      // v3 model: module.exports = df.orchestrator(function*(context) { ... })
      const v3OrchMatch = line.match(/df\.orchestrator\s*\(/);
      if (v3OrchMatch) {
        const name = this.inferFunctionName(filePath);
        const callsTo = this.extractCallsFromBlock(lines, i);
        functions.push({
          name,
          type: 'orchestrator',
          filePath,
          line: i,
          column: line.indexOf(v3OrchMatch[0]),
          callsTo,
          language: 'typescript',
        });
        continue;
      }

      // HTTP trigger with durableClient input (v4 starter pattern)
      if (line.match(/df\.input\.durableClient\s*\(\)/) || line.match(/extraInputs.*durableClient/)) {
        // Look backwards for the app.http declaration
        for (let j = Math.max(0, i - 10); j <= i; j++) {
          const httpMatch = lines[j].match(/app\.http\s*\(\s*['"`]([^'"`]+)['"`]/);
          if (httpMatch) {
            functions.push({
              name: httpMatch[1],
              type: 'durableClient',
              filePath,
              line: j,
              column: lines[j].indexOf(httpMatch[0]),
              callsTo: this.extractStartNewCalls(lines, j, i + 20),
              language: 'typescript',
            });
            break;
          }
        }
      }
    }

    return functions;
  }

  private extractCallsFromOrchestrator(content: string, _orchName: string): string[] {
    const calls: string[] = [];

    // context.df.callActivity('name', ...)
    const activityCalls = content.matchAll(/context\.df\.callActivity\s*\(\s*['"`]([^'"`]+)['"`]/g);
    for (const match of activityCalls) {
      if (!calls.includes(match[1])) calls.push(match[1]);
    }

    // context.df.callSubOrchestrator('name', ...)
    const subOrchCalls = content.matchAll(
      /context\.df\.callSubOrchestrator\s*\(\s*['"`]([^'"`]+)['"`]/g,
    );
    for (const match of subOrchCalls) {
      if (!calls.includes(match[1])) calls.push(match[1]);
    }

    // context.df.waitForExternalEvent('name')
    const eventCalls = content.matchAll(
      /context\.df\.waitForExternalEvent\s*\(\s*['"`]([^'"`]+)['"`]/g,
    );
    for (const match of eventCalls) {
      if (!calls.includes(`event:${match[1]}`)) calls.push(`event:${match[1]}`);
    }

    return calls;
  }

  private extractCallsFromBlock(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 100);

    for (let i = startLine; i < end; i++) {
      const actMatch = lines[i].match(/callActivity\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (actMatch && !calls.includes(actMatch[1])) {
        calls.push(actMatch[1]);
      }
      const subMatch = lines[i].match(/callSubOrchestrator\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (subMatch && !calls.includes(subMatch[1])) {
        calls.push(subMatch[1]);
      }
    }

    return calls;
  }

  private extractStartNewCalls(lines: string[], start: number, end: number): string[] {
    const calls: string[] = [];
    const limit = Math.min(lines.length, end);
    for (let i = start; i < limit; i++) {
      const match = lines[i].match(/startNew\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (match && !calls.includes(match[1])) calls.push(match[1]);
    }
    return calls;
  }

  private inferFunctionName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(ts|js|mts|mjs)$/, '');
  }
}
