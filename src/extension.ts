import * as vscode from 'vscode';
import { getConfig } from './utils/config';
import { Logger } from './utils/logger';
import { TelemetryService } from './services/telemetryService';
import { FunctionsTreeProvider } from './views/functionsTreeView';
import { InstancesTreeProvider } from './views/instancesTreeView';
import { ConnectionsTreeProvider } from './views/connectionsTreeView';
import { LocalProvider } from './providers/localProvider';
import { DurableApiClient } from './providers/durableApiClient';
import { ProviderFactory } from './providers/providerFactory';
import { registerCommands } from './commands';
import { AnalyzerService } from './analyzers';
import { AlertService } from './services/alertService';
import { InstanceWatcher } from './services/instanceWatcher';
import {
  DurableCodeLensProvider,
  DurableDefinitionProvider,
  DurableHoverProvider,
} from './codelens/durableCodeLensProvider';

let logger: Logger;
let telemetry: TelemetryService;

export function activate(context: vscode.ExtensionContext) {
  logger = Logger.getInstance();
  telemetry = TelemetryService.getInstance();
  logger.info('DurableFlow extension is activating...');

  const config = getConfig();
  const localProvider = new LocalProvider(config.localPort);
  const durableClient = new DurableApiClient(config.localPort, config.taskHubName);
  const providerFactory = new ProviderFactory(config.localPort);
  const analyzerService = new AnalyzerService();

  // Tree Views
  const functionsTree = new FunctionsTreeProvider(localProvider);
  const instancesTree = new InstancesTreeProvider(durableClient, config);
  const connectionsTree = new ConnectionsTreeProvider(config);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('durableFunctionsUI.functions', functionsTree),
    vscode.window.registerTreeDataProvider('durableFunctionsUI.instances', instancesTree),
    vscode.window.registerTreeDataProvider('durableFunctionsUI.connections', connectionsTree),
  );

  // CodeLens, Definition, and Hover providers
  if (config.showCodeLens) {
    const codeLensProvider = new DurableCodeLensProvider(analyzerService);
    const definitionProvider = new DurableDefinitionProvider(analyzerService);
    const hoverProvider = new DurableHoverProvider(analyzerService);

    const supportedLanguages = [
      { language: 'typescript' },
      { language: 'javascript' },
      { language: 'csharp' },
      { language: 'python' },
      { language: 'java' },
    ];

    for (const selector of supportedLanguages) {
      context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
        vscode.languages.registerDefinitionProvider(selector, definitionProvider),
        vscode.languages.registerHoverProvider(selector, hoverProvider),
      );
    }

    // Re-analyze on file save
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (analyzerService.getAnalyzerForFile(doc.uri.fsPath)) {
          analyzerService.analyzeFile(doc.uri.fsPath, doc.getText());
          codeLensProvider.refresh();
        }
      }),
    );
  }

  // Commands
  registerCommands(context, {
    localProvider,
    durableClient,
    providerFactory,
    functionsTree,
    instancesTree,
    connectionsTree,
    analyzerService,
    config,
    extensionUri: context.extensionUri,
  });

  // Alert Service
  const alertService = new AlertService(durableClient);
  alertService.start(config.pollingIntervalMs);
  context.subscriptions.push({ dispose: () => alertService.dispose() });

  // Instance Watcher
  const instanceWatcher = new InstanceWatcher(durableClient, config, localProvider);
  context.subscriptions.push(instanceWatcher);

  // Auto-detect project and do initial scan
  detectProject(analyzerService, instanceWatcher);

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('durableFunctionsUI')) {
        const newConfig = getConfig();
        localProvider.updatePort(newConfig.localPort);
        durableClient.updateConfig(newConfig.localPort, newConfig.taskHubName);
        instancesTree.updateConfig(newConfig);
        connectionsTree.updateConfig(newConfig);
        logger.info('Configuration updated');
      }
    }),
  );

  context.subscriptions.push(telemetry);

  logger.info('DurableFlow extension activated');
  telemetry.trackEvent('extensionActivated');

  // Show output channel so user can see extension activity
  logger.show();
}

async function detectProject(analyzerService: AnalyzerService, instanceWatcher: InstanceWatcher) {
  const hostJsonFiles = await vscode.workspace.findFiles('**/host.json', '**/node_modules/**', 5);
  if (hostJsonFiles.length > 0) {
    logger.info(`✅ Found ${hostJsonFiles.length} Azure Functions project(s)`);
    vscode.commands.executeCommand(
      'setContext',
      'durableFunctionsUI.projectDetected',
      true,
    );
    // Run initial workspace scan
    analyzerService.scanWorkspace();
    // Start watching for new orchestration instances
    logger.info('🔍 Starting instance watcher — will detect new orchestrations automatically');
    instanceWatcher.start();
  } else {
    logger.info('⚠️ No host.json found — open a folder with an Azure Functions project');
  }
}

export function deactivate() {
  logger?.info('DurableFlow extension deactivated');
}
