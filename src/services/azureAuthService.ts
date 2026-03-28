import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

const AZURE_ACCOUNT_EXT_ID = 'ms-vscode.azure-account';

/** Minimal typing for the Azure Account extension API */
interface AzureSession {
  readonly environment: { name: string };
  readonly userId: string;
  readonly tenantId: string;
  credentials2: {
    getToken(scopes: string | string[]): Promise<{ token: string; expiresOnTimestamp: number } | null>;
  };
}

interface AzureSubscription {
  readonly session: AzureSession;
  readonly subscription: {
    readonly subscriptionId: string | undefined;
    readonly displayName: string | undefined;
  };
}

interface AzureAccountApi {
  readonly status: string;
  readonly onStatusChanged: vscode.Event<string>;
  readonly sessions: readonly AzureSession[];
  readonly onSessionsChanged: vscode.Event<void>;
  readonly filters: readonly AzureSubscription[];
  readonly onFiltersChanged: vscode.Event<void>;
  waitForLogin(): Promise<boolean>;
  waitForFilters(): Promise<boolean>;
}

export interface AzureSubscriptionInfo {
  subscriptionId: string;
  displayName: string;
  tenantId: string;
}

export class AzureAuthService implements vscode.Disposable {
  private static instance: AzureAuthService | undefined;
  private readonly logger = Logger.getInstance();
  private readonly disposables: vscode.Disposable[] = [];
  private accountApi: AzureAccountApi | undefined;

  private readonly _onDidChangeAuthState = new vscode.EventEmitter<boolean>();
  /** Fires when the user logs in or out. */
  readonly onDidChangeAuthState: vscode.Event<boolean> = this._onDidChangeAuthState.event;

  private constructor() {
    this.disposables.push(this._onDidChangeAuthState);
  }

  static getInstance(): AzureAuthService {
    if (!AzureAuthService.instance) {
      AzureAuthService.instance = new AzureAuthService();
    }
    return AzureAuthService.instance;
  }

  /** Try to acquire the Azure Account extension API (lazy). */
  private getAccountApi(): AzureAccountApi | undefined {
    if (this.accountApi) {
      return this.accountApi;
    }

    const ext = vscode.extensions.getExtension<AzureAccountApi>(AZURE_ACCOUNT_EXT_ID);
    if (!ext) {
      return undefined;
    }

    this.accountApi = ext.isActive ? ext.exports : undefined;
    if (this.accountApi) {
      this.subscribeToApiEvents(this.accountApi);
    }
    return this.accountApi;
  }

  private subscribeToApiEvents(api: AzureAccountApi): void {
    this.disposables.push(
      api.onStatusChanged((status) => {
        const loggedIn = status === 'LoggedIn';
        this.logger.info(`Azure auth status changed: ${status}`);
        this._onDidChangeAuthState.fire(loggedIn);
      }),
    );
  }

  // ── Public API ──────────────────────────────────────────────

  /** Sign in via the Azure Account extension. */
  async login(): Promise<boolean> {
    const api = this.getAccountApi();

    if (!api) {
      await this.promptInstallExtension();
      return false;
    }

    if (api.status === 'LoggedIn') {
      this.logger.info('Already logged in to Azure');
      return true;
    }

    this.logger.info('Initiating Azure login…');
    await vscode.commands.executeCommand('azure-account.login');
    const success = await api.waitForLogin();

    if (success) {
      this.logger.info('Azure login successful');
      this._onDidChangeAuthState.fire(true);
    } else {
      this.logger.warn('Azure login was cancelled or failed');
    }
    return success;
  }

  /** Sign out via the Azure Account extension. */
  async logout(): Promise<void> {
    const api = this.getAccountApi();
    if (!api) {
      return;
    }

    this.logger.info('Logging out of Azure…');
    await vscode.commands.executeCommand('azure-account.logout');
    this._onDidChangeAuthState.fire(false);
    this.logger.info('Azure logout completed');
  }

  /** Whether the user is currently authenticated. */
  isLoggedIn(): boolean {
    const api = this.getAccountApi();
    return api?.status === 'LoggedIn';
  }

  /**
   * Get an access token for the Azure Resource Manager scope.
   * Returns `undefined` when the user is not logged in.
   */
  async getAccessToken(
    resourceOrScope: string = 'https://management.azure.com/.default',
  ): Promise<string | undefined> {
    const api = this.getAccountApi();
    if (!api || api.status !== 'LoggedIn') {
      this.logger.warn('Cannot get access token — not logged in');
      return undefined;
    }

    const session = api.sessions[0];
    if (!session) {
      this.logger.warn('No Azure session available');
      return undefined;
    }

    try {
      const tokenResponse = await session.credentials2.getToken(resourceOrScope);
      return tokenResponse?.token;
    } catch (err) {
      this.logger.error('Failed to acquire access token', err);
      return undefined;
    }
  }

  /** List the subscriptions visible to the currently logged-in user. */
  async getSubscriptions(): Promise<AzureSubscriptionInfo[]> {
    const api = this.getAccountApi();
    if (!api || api.status !== 'LoggedIn') {
      this.logger.warn('Cannot list subscriptions — not logged in');
      return [];
    }

    await api.waitForFilters();

    return api.filters.map((f) => ({
      subscriptionId: f.subscription.subscriptionId ?? '',
      displayName: f.subscription.displayName ?? '',
      tenantId: f.session.tenantId,
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async promptInstallExtension(): Promise<void> {
    const install = 'Install';
    const result = await vscode.window.showWarningMessage(
      'The Azure Account extension is required for Azure authentication. Please install it to continue.',
      install,
    );

    if (result === install) {
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        AZURE_ACCOUNT_EXT_ID,
      );
      this.logger.info('Azure Account extension install requested');
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    AzureAuthService.instance = undefined;
  }
}
