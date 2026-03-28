import * as vscode from 'vscode';
import { ILanguageAnalyzer, DetectedFunction } from './ILanguageAnalyzer';
import { TypeScriptAnalyzer } from './typescriptAnalyzer';
import { CSharpAnalyzer } from './csharpAnalyzer';
import { PythonAnalyzer } from './pythonAnalyzer';
import { JavaAnalyzer } from './javaAnalyzer';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryService';

export class AnalyzerService {
  private analyzers: ILanguageAnalyzer[];
  private cache = new Map<string, DetectedFunction[]>();
  private logger = Logger.getInstance();

  constructor() {
    this.analyzers = [
      new TypeScriptAnalyzer(),
      new CSharpAnalyzer(),
      new PythonAnalyzer(),
      new JavaAnalyzer(),
    ];
  }

  /** Get the analyzer that supports a given file extension */
  getAnalyzerForFile(filePath: string): ILanguageAnalyzer | undefined {
    const ext = '.' + filePath.split('.').pop()?.toLowerCase();
    return this.analyzers.find((a) => a.supportedExtensions.includes(ext));
  }

  /** Analyze a single file */
  analyzeFile(filePath: string, content: string): DetectedFunction[] {
    const analyzer = this.getAnalyzerForFile(filePath);
    if (!analyzer) return [];

    try {
      const results = analyzer.analyzeFile(filePath, content);
      this.cache.set(filePath, results);
      return results;
    } catch (error) {
      this.logger.error(`Error analyzing ${filePath}`, error);
      return [];
    }
  }

  /** Scan the entire workspace for Durable Functions */
  async scanWorkspace(): Promise<DetectedFunction[]> {
    const allFunctions: DetectedFunction[] = [];
    const extensions = this.analyzers.flatMap((a) => a.supportedExtensions);
    const globPattern = `**/*{${extensions.join(',')}}`;

    const files = await vscode.workspace.findFiles(
      globPattern,
      '**/node_modules/**',
      500,
    );

    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const results = this.analyzeFile(file.fsPath, doc.getText());
        allFunctions.push(...results);
      } catch {
        // Skip files that can't be opened
      }
    }

    this.logger.info(`Workspace scan found ${allFunctions.length} Durable Functions`);
    TelemetryService.getInstance().trackEvent('analyzerScanCompleted', {
      functionCount: String(allFunctions.length),
    });
    return allFunctions;
  }

  /** Get cached results for a file */
  getCachedResults(filePath: string): DetectedFunction[] {
    return this.cache.get(filePath) ?? [];
  }

  /** Get all cached results */
  getAllCachedResults(): DetectedFunction[] {
    const all: DetectedFunction[] = [];
    for (const results of this.cache.values()) {
      all.push(...results);
    }
    return all;
  }

  /** Find a function by name across all cached results */
  findFunctionByName(name: string): DetectedFunction | undefined {
    for (const results of this.cache.values()) {
      const found = results.find((f) => f.name === name);
      if (found) return found;
    }
    return undefined;
  }

  /** Find all callers of a function (which orchestrators call this activity) */
  findCallers(functionName: string): DetectedFunction[] {
    const callers: DetectedFunction[] = [];
    for (const results of this.cache.values()) {
      for (const fn of results) {
        if (fn.callsTo.includes(functionName)) {
          callers.push(fn);
        }
      }
    }
    return callers;
  }

  clearCache() {
    this.cache.clear();
  }
}

export { DetectedFunction, ILanguageAnalyzer };
