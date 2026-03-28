import { FunctionType } from '../models';

export interface DetectedFunction {
  name: string;
  type: FunctionType;
  filePath: string;
  /** Line number (0-based) where the function is defined */
  line: number;
  /** Column number (0-based) */
  column: number;
  /** Names of activities/sub-orchestrations called by this function */
  callsTo: string[];
  language: string;
}

export interface ILanguageAnalyzer {
  /** File extensions this analyzer supports */
  readonly supportedExtensions: string[];
  /** Language identifier */
  readonly languageId: string;
  /** Analyze a file and return detected Durable Functions */
  analyzeFile(filePath: string, content: string): DetectedFunction[];
}
