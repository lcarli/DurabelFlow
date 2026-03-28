import * as vscode from 'vscode';
import { DurableApiClient } from '../providers/durableApiClient';
import { LocalProvider } from '../providers/localProvider';
import { ExtensionConfig } from '../utils/config';
import { Logger } from '../utils/logger';
import { OrchestrationInstance } from '../models';

export class InstanceWatcher implements vscode.Disposable {
  private readonly logger = Logger.getInstance();
  private readonly durableClient: DurableApiClient;
  private readonly localProvider: LocalProvider;
  private readonly config: ExtensionConfig;

  private seenInstanceIds = new Set<string>();
  private pollingTimer?: ReturnType<typeof setInterval>;
  private hostCheckTimer?: ReturnType<typeof setInterval>;
  private isRunning = false;

  private readonly _onNewInstance = new vscode.EventEmitter<OrchestrationInstance>();
  readonly onNewInstance: vscode.Event<OrchestrationInstance> = this._onNewInstance.event;

  constructor(
    durableClient: DurableApiClient,
    config: ExtensionConfig,
    localProvider: LocalProvider,
  ) {
    this.durableClient = durableClient;
    this.config = config;
    this.localProvider = localProvider;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const hostUp = await this.localProvider.isHostRunning();
    if (hostUp) {
      this.beginPolling();
    } else {
      this.logger.info('Function host not running — waiting for host to start before watching instances');
      this.waitForHost();
    }
  }

  stop(): void {
    this.clearPolling();
    this.clearHostCheck();
    this.isRunning = false;
    this.logger.debug('Instance watcher stopped');
  }

  dispose(): void {
    this.stop();
    this.seenInstanceIds.clear();
    this._onNewInstance.dispose();
  }

  private beginPolling(): void {
    this.clearHostCheck();
    this.isRunning = true;
    this.logger.info(`Instance watcher started (interval: ${this.config.pollingIntervalMs}ms)`);

    // Fetch the system key before starting to poll
    void this.durableClient.fetchSystemKey().then(() => {
      void this.poll(true);
      this.pollingTimer = setInterval(() => void this.poll(false), this.config.pollingIntervalMs);
    });
  }

  private waitForHost(): void {
    this.clearHostCheck();
    this.hostCheckTimer = setInterval(async () => {
      try {
        const running = await this.localProvider.isHostRunning();
        if (running) {
          this.logger.info('Function host detected — starting instance watcher');
          this.beginPolling();
        }
      } catch {
        // Host still not available
      }
    }, this.config.pollingIntervalMs);
  }

  private async poll(seedOnly: boolean): Promise<void> {
    try {
      const instances = await this.durableClient.listInstances({ showInput: false });

      for (const instance of instances) {
        if (!this.seenInstanceIds.has(instance.instanceId)) {
          this.seenInstanceIds.add(instance.instanceId);

          if (!seedOnly) {
            this.handleNewInstance(instance);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error polling for new instances', error);
    }
  }

  private handleNewInstance(instance: OrchestrationInstance): void {
    this.logger.info(`New orchestration detected: "${instance.name}" (${instance.instanceId})`);
    this._onNewInstance.fire(instance);

    void vscode.window
      .showInformationMessage(
        `🎭 New orchestration "${instance.name}" detected (${instance.runtimeStatus})`,
        'Show Flow',
        'View Details',
        'Dismiss',
      )
      .then((action) => {
        if (action === 'Show Flow') {
          void vscode.commands.executeCommand(
            'durableFunctionsUI.showOrchestrationFlow',
            { instance: { instanceId: instance.instanceId } },
          );
        } else if (action === 'View Details') {
          void vscode.commands.executeCommand(
            'durableFunctionsUI.viewInstanceDetails',
            { instance: { instanceId: instance.instanceId } },
          );
        }
      });
  }

  private clearPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private clearHostCheck(): void {
    if (this.hostCheckTimer) {
      clearInterval(this.hostCheckTimer);
      this.hostCheckTimer = undefined;
    }
  }
}
