import * as vscode from 'vscode';
import { DurableApiClient } from '../providers/durableApiClient';
import { Logger } from '../utils/logger';
import { OrchestrationInstance } from '../models';

interface AlertConfig {
  enabled: boolean;
  longRunningThresholdMinutes: number;
  failureAlertEnabled: boolean;
}

export class AlertService {
  private readonly logger = Logger.getInstance();
  private readonly durableClient: DurableApiClient;
  private pollingTimer?: ReturnType<typeof setInterval>;
  private alertedInstanceIds = new Set<string>();
  private configListener?: vscode.Disposable;

  constructor(durableClient: DurableApiClient) {
    this.durableClient = durableClient;
  }

  private getAlertConfig(): AlertConfig {
    const cfg = vscode.workspace.getConfiguration('durableFunctionsUI');
    return {
      enabled: cfg.get<boolean>('alerts.enabled', false),
      longRunningThresholdMinutes: cfg.get<number>('alerts.longRunningThresholdMinutes', 30),
      failureAlertEnabled: cfg.get<boolean>('alerts.failureAlertEnabled', true),
    };
  }

  start(pollingIntervalMs: number) {
    const config = this.getAlertConfig();
    if (!config.enabled) {
      this.logger.info('Alert monitoring is disabled');
      return;
    }

    this.stop();
    this.logger.info('Alert monitoring started');

    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('durableFunctionsUI.alerts')) {
        const newConfig = this.getAlertConfig();
        if (!newConfig.enabled) {
          this.stop();
          this.logger.info('Alert monitoring disabled via configuration');
        }
      }
    });

    void this.checkAlerts();
    this.pollingTimer = setInterval(() => void this.checkAlerts(), pollingIntervalMs);
  }

  stop() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    if (this.configListener) {
      this.configListener.dispose();
      this.configListener = undefined;
    }
    this.logger.debug('Alert monitoring stopped');
  }

  private async checkAlerts() {
    const config = this.getAlertConfig();
    if (!config.enabled) {
      return;
    }

    try {
      const instances = await this.durableClient.listInstances({
        runtimeStatus: ['Running'],
        showInput: false,
      });

      for (const instance of instances) {
        this.checkLongRunning(instance, config);
      }

      if (config.failureAlertEnabled) {
        await this.checkFailures();
      }
    } catch (error) {
      this.logger.error('Error checking alerts', error);
    }
  }

  private checkLongRunning(instance: OrchestrationInstance, config: AlertConfig) {
    const alertKey = `long-running:${instance.instanceId}`;
    if (this.alertedInstanceIds.has(alertKey)) {
      return;
    }

    const created = new Date(instance.createdTime).getTime();
    const now = Date.now();
    const runningMinutes = (now - created) / (1000 * 60);

    if (runningMinutes >= config.longRunningThresholdMinutes) {
      this.alertedInstanceIds.add(alertKey);
      const durationStr = runningMinutes >= 60
        ? `${(runningMinutes / 60).toFixed(1)}h`
        : `${Math.round(runningMinutes)}m`;

      void vscode.window
        .showWarningMessage(
          `⏱ Long-running orchestration "${instance.name}" (${durationStr}) — Instance: ${instance.instanceId}`,
          'View Details',
          'Dismiss',
        )
        .then((action) => {
          if (action === 'View Details') {
            void vscode.commands.executeCommand(
              'durableFunctionsUI.viewInstanceDetails',
              { instance: { instanceId: instance.instanceId } },
            );
          }
        });

      this.logger.warn(
        `Long-running alert: ${instance.name} (${instance.instanceId}) running for ${durationStr}`,
      );
    }
  }

  private async checkFailures() {
    try {
      const failedInstances = await this.durableClient.listInstances({
        runtimeStatus: ['Failed'],
        showInput: false,
      });

      for (const instance of failedInstances) {
        const alertKey = `failed:${instance.instanceId}`;
        if (this.alertedInstanceIds.has(alertKey)) {
          continue;
        }

        this.alertedInstanceIds.add(alertKey);

        void vscode.window
          .showWarningMessage(
            `❌ Orchestration failed: "${instance.name}" — Instance: ${instance.instanceId}`,
            'View Details',
            'Dismiss',
          )
          .then((action) => {
            if (action === 'View Details') {
              void vscode.commands.executeCommand(
                'durableFunctionsUI.viewInstanceDetails',
                { instance: { instanceId: instance.instanceId } },
              );
            }
          });

        this.logger.warn(
          `Failure alert: ${instance.name} (${instance.instanceId})`,
        );
      }
    } catch (error) {
      this.logger.error('Error checking failure alerts', error);
    }
  }

  dispose() {
    this.stop();
    this.alertedInstanceIds.clear();
  }
}
