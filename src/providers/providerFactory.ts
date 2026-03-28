import { IFunctionProvider } from './IFunctionProvider';
import { LocalProvider } from './localProvider';
import { AzureProvider } from './azureProvider';

export class ProviderFactory {
  private localProvider: LocalProvider;
  private azureProvider: AzureProvider;
  private activeProvider: IFunctionProvider;

  constructor(localPort: number) {
    this.localProvider = new LocalProvider(localPort);
    this.azureProvider = new AzureProvider();
    this.activeProvider = this.localProvider;
  }

  getActiveProvider(): IFunctionProvider {
    return this.activeProvider;
  }

  getLocalProvider(): LocalProvider {
    return this.localProvider;
  }

  getAzureProvider(): AzureProvider {
    return this.azureProvider;
  }

  switchToLocal() {
    this.activeProvider = this.localProvider;
  }

  async switchToAzure(
    subscriptionId: string,
    resourceGroup: string,
    functionAppName: string,
    accessToken: string,
  ): Promise<boolean> {
    const success = await this.azureProvider.configure(
      subscriptionId,
      resourceGroup,
      functionAppName,
      accessToken,
    );
    if (success) {
      this.activeProvider = this.azureProvider;
    }
    return success;
  }

  isUsingAzure(): boolean {
    return this.activeProvider === this.azureProvider;
  }
}
