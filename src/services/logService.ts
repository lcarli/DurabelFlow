import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class LogService {
  private outputChannel: vscode.OutputChannel;
  private instanceChannels = new Map<string, vscode.OutputChannel>();
  private logger = Logger.getInstance();

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('DurableFlow Logs');
  }

  /** Log a message to the main output channel */
  log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    this.outputChannel.appendLine(`${prefix} ${message}`);
  }

  /** Log a message for a specific orchestration instance */
  logForInstance(instanceId: string, instanceName: string, message: string) {
    const channelKey = `${instanceId.substring(0, 8)}`;
    let channel = this.instanceChannels.get(instanceId);

    if (!channel) {
      channel = vscode.window.createOutputChannel(`Durable: ${instanceName} (${channelKey})`);
      this.instanceChannels.set(instanceId, channel);
    }

    const timestamp = new Date().toISOString();
    channel.appendLine(`[${timestamp}] ${message}`);

    // Also log to main channel
    this.outputChannel.appendLine(`[${timestamp}] [${instanceName}/${channelKey}] ${message}`);
  }

  /** Log orchestration state changes */
  logStateChange(
    instanceId: string,
    instanceName: string,
    oldStatus: string,
    newStatus: string,
  ) {
    const msg = `Status: ${oldStatus} → ${newStatus}`;
    this.logForInstance(instanceId, instanceName, msg);

    if (newStatus === 'Failed') {
      this.log(`❌ Orchestration "${instanceName}" (${instanceId.substring(0, 8)}) FAILED`, 'error');
    } else if (newStatus === 'Completed') {
      this.log(`✅ Orchestration "${instanceName}" (${instanceId.substring(0, 8)}) completed`);
    }
  }

  /** Log activity execution */
  logActivity(
    instanceId: string,
    instanceName: string,
    activityName: string,
    event: 'scheduled' | 'completed' | 'failed',
    duration?: number,
  ) {
    const durationStr = duration !== undefined ? ` (${this.formatDuration(duration)})` : '';
    const icon = event === 'completed' ? '✅' : event === 'failed' ? '❌' : '⏳';
    const msg = `${icon} Activity "${activityName}" ${event}${durationStr}`;
    this.logForInstance(instanceId, instanceName, msg);
  }

  /** Show the main output channel */
  show() {
    this.outputChannel.show();
  }

  /** Show the output channel for a specific instance */
  showForInstance(instanceId: string) {
    const channel = this.instanceChannels.get(instanceId);
    if (channel) {
      channel.show();
    } else {
      this.outputChannel.show();
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  dispose() {
    this.outputChannel.dispose();
    for (const channel of this.instanceChannels.values()) {
      channel.dispose();
    }
    this.instanceChannels.clear();
  }
}
