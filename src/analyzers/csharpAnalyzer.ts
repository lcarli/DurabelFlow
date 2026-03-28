import { ILanguageAnalyzer, DetectedFunction } from './ILanguageAnalyzer';

/**
 * Detects Durable Functions in C# files.
 *
 * Supports both in-process and isolated worker models.
 */
export class CSharpAnalyzer implements ILanguageAnalyzer {
  readonly supportedExtensions = ['.cs'];
  readonly languageId = 'csharp';

  analyzeFile(filePath: string, content: string): DetectedFunction[] {
    const functions: DetectedFunction[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // [FunctionName("Name")] or [Function("Name")]
      const fnNameMatch = line.match(/\[\s*(?:FunctionName|Function)\s*\(\s*"([^"]+)"\s*\)/);
      if (!fnNameMatch) continue;

      const name = fnNameMatch[1];
      const col = line.indexOf(fnNameMatch[0]);

      // Look at subsequent lines for trigger type
      const lookAhead = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

      if (lookAhead.match(/\[\s*OrchestrationTrigger\s*\]/)) {
        const callsTo = this.extractCallsFromBlock(lines, i);
        functions.push({
          name,
          type: 'orchestrator',
          filePath,
          line: i,
          column: col,
          callsTo,
          language: 'csharp',
        });
      } else if (lookAhead.match(/\[\s*ActivityTrigger\s*\]/)) {
        functions.push({
          name,
          type: 'activity',
          filePath,
          line: i,
          column: col,
          callsTo: [],
          language: 'csharp',
        });
      } else if (lookAhead.match(/\[\s*EntityTrigger\s*\]/)) {
        functions.push({
          name,
          type: 'entity',
          filePath,
          line: i,
          column: col,
          callsTo: [],
          language: 'csharp',
        });
      } else if (lookAhead.match(/\[\s*(?:DurableClient|OrchestrationClient)\s*\]/)) {
        const startsTo = this.extractStartNewCalls(lines, i);
        functions.push({
          name,
          type: 'durableClient',
          filePath,
          line: i,
          column: col,
          callsTo: startsTo,
          language: 'csharp',
        });
      } else if (lookAhead.match(/\[\s*HttpTrigger\s*\(/)) {
        // HTTP trigger without durable client is a plain HTTP function
        if (lookAhead.match(/\[\s*(?:DurableClient|OrchestrationClient)\s*\]/)) {
          const startsTo = this.extractStartNewCalls(lines, i);
          functions.push({
            name,
            type: 'durableClient',
            filePath,
            line: i,
            column: col,
            callsTo: startsTo,
            language: 'csharp',
          });
        } else {
          functions.push({
            name,
            type: 'httpTrigger',
            filePath,
            line: i,
            column: col,
            callsTo: [],
            language: 'csharp',
          });
        }
      }
    }

    return functions;
  }

  private extractCallsFromBlock(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 150);
    let braceDepth = 0;
    let started = false;

    for (let i = startLine; i < end; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { braceDepth++; started = true; }
        if (ch === '}') braceDepth--;
      }
      if (started && braceDepth <= 0) break;

      // CallActivityAsync<T>("Name", ...)
      const actMatch = line.match(/CallActivityAsync(?:<[^>]*>)?\s*\(\s*"([^"]+)"/);
      if (actMatch && !calls.includes(actMatch[1])) calls.push(actMatch[1]);

      // CallSubOrchestratorAsync<T>("Name", ...)
      const subMatch = line.match(/CallSubOrchestratorAsync(?:<[^>]*>)?\s*\(\s*"([^"]+)"/);
      if (subMatch && !calls.includes(subMatch[1])) calls.push(subMatch[1]);

      // WaitForExternalEvent("Name")
      const eventMatch = line.match(/WaitForExternalEvent(?:<[^>]*>)?\s*\(\s*"([^"]+)"/);
      if (eventMatch && !calls.includes(`event:${eventMatch[1]}`)) {
        calls.push(`event:${eventMatch[1]}`);
      }
    }

    return calls;
  }

  private extractStartNewCalls(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 30);
    for (let i = startLine; i < end; i++) {
      const match = lines[i].match(/StartNewAsync(?:<[^>]*>)?\s*\(\s*"([^"]+)"/);
      if (match && !calls.includes(match[1])) calls.push(match[1]);
    }
    return calls;
  }
}
