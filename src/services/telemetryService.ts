import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class TelemetryService {
  private static instance: TelemetryService;
  private logger = Logger.getInstance();
  private configListener: vscode.Disposable;

  private constructor() {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('durableFunctionsUI.enableTelemetry') ||
        e.affectsConfiguration('telemetry.telemetryLevel')
      ) {
        this.logger.debug(
          `Telemetry setting changed — enabled: ${this.isEnabled()}`,
        );
      }
    });
  }

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Telemetry is enabled only when BOTH:
   *   1. The extension-level opt-in (`durableFunctionsUI.enableTelemetry`) is true
   *   2. VSCode's global telemetry level is not "off"
   */
  private isEnabled(): boolean {
    const extensionOptIn = vscode.workspace
      .getConfiguration('durableFunctionsUI')
      .get<boolean>('enableTelemetry', false);

    const vscodeTelemetryLevel = vscode.workspace
      .getConfiguration('telemetry')
      .get<string>('telemetryLevel', 'all');

    return extensionOptIn && vscodeTelemetryLevel !== 'off';
  }

  /**
   * Track a named event with optional string properties.
   * No-op when telemetry is disabled.
   */
  trackEvent(name: string, properties?: Record<string, string>): void {
    if (!this.isEnabled()) {
      return;
    }

    const propsStr = properties
      ? ' ' + JSON.stringify(properties)
      : '';
    this.logger.info(`[Telemetry] ${name}${propsStr}`);
  }

  /**
   * Track an error.
   * No-op when telemetry is disabled.
   */
  trackError(error: Error): void {
    if (!this.isEnabled()) {
      return;
    }

    this.logger.error(
      `[Telemetry] error: ${error.message}`,
      error.stack ?? '',
    );
  }

  dispose(): void {
    this.configListener.dispose();
  }
}
