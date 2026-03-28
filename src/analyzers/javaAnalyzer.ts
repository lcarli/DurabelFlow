import { ILanguageAnalyzer, DetectedFunction } from './ILanguageAnalyzer';

/**
 * Detects Durable Functions in Java files.
 */
export class JavaAnalyzer implements ILanguageAnalyzer {
  readonly supportedExtensions = ['.java'];
  readonly languageId = 'java';

  analyzeFile(filePath: string, content: string): DetectedFunction[] {
    const functions: DetectedFunction[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // @FunctionName("Name")
      const fnNameMatch = line.match(/@FunctionName\s*\(\s*"([^"]+)"\s*\)/);
      if (!fnNameMatch) continue;

      const name = fnNameMatch[1];
      const col = line.indexOf(fnNameMatch[0]);
      const lookAhead = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

      if (lookAhead.match(/@DurableOrchestrationTrigger/)) {
        const callsTo = this.extractCallsFromBlock(lines, i);
        functions.push({
          name,
          type: 'orchestrator',
          filePath,
          line: i,
          column: col,
          callsTo,
          language: 'java',
        });
      } else if (lookAhead.match(/@DurableActivityTrigger/)) {
        functions.push({
          name,
          type: 'activity',
          filePath,
          line: i,
          column: col,
          callsTo: [],
          language: 'java',
        });
      } else if (lookAhead.match(/@EntityTrigger/)) {
        functions.push({
          name,
          type: 'entity',
          filePath,
          line: i,
          column: col,
          callsTo: [],
          language: 'java',
        });
      } else if (lookAhead.match(/@DurableClientInput/)) {
        const startsTo = this.extractStartCalls(lines, i);
        functions.push({
          name,
          type: 'durableClient',
          filePath,
          line: i,
          column: col,
          callsTo: startsTo,
          language: 'java',
        });
      } else if (lookAhead.match(/@HttpTrigger/)) {
        functions.push({
          name,
          type: 'httpTrigger',
          filePath,
          line: i,
          column: col,
          callsTo: [],
          language: 'java',
        });
      }
    }

    return functions;
  }

  private extractCallsFromBlock(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 100);
    let braceDepth = 0;
    let started = false;

    for (let i = startLine; i < end; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { braceDepth++; started = true; }
        if (ch === '}') braceDepth--;
      }
      if (started && braceDepth <= 0) break;

      // ctx.callActivity("Name", ..., Type.class)
      const actMatch = line.match(/callActivity\s*\(\s*"([^"]+)"/);
      if (actMatch && !calls.includes(actMatch[1])) calls.push(actMatch[1]);

      // ctx.callSubOrchestrator("Name", ...)
      const subMatch = line.match(/callSubOrchestrator\s*\(\s*"([^"]+)"/);
      if (subMatch && !calls.includes(subMatch[1])) calls.push(subMatch[1]);

      // ctx.waitForExternalEvent("Name")
      const eventMatch = line.match(/waitForExternalEvent\s*\(\s*"([^"]+)"/);
      if (eventMatch && !calls.includes(`event:${eventMatch[1]}`)) {
        calls.push(`event:${eventMatch[1]}`);
      }
    }

    return calls;
  }

  private extractStartCalls(lines: string[], startLine: number): string[] {
    const calls: string[] = [];
    const end = Math.min(lines.length, startLine + 30);
    for (let i = startLine; i < end; i++) {
      const match = lines[i].match(/scheduleNewOrchestrationInstance\s*\(\s*"([^"]+)"/);
      if (match && !calls.includes(match[1])) calls.push(match[1]);
    }
    return calls;
  }
}
