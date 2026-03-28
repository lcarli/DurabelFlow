import { HttpClient } from '../utils/httpClient';
import { Logger } from '../utils/logger';

interface AppInsightsQueryResult {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
    rows: unknown[][];
  }>;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  severityLevel: number;
  customDimensions: string;
  [key: string]: unknown;
}

export interface ExceptionEntry {
  timestamp: string;
  problemId: string;
  outerMessage: string;
  details: string;
  [key: string]: unknown;
}

export interface OrchestrationMetrics {
  avgDurationMs: number;
  successRate: number;
  throughput: number;
}

export class AppInsightsService {
  private client: HttpClient;
  private logger = Logger.getInstance();
  private appId: string = '';
  private apiKey: string = '';
  private configured = false;

  constructor() {
    this.client = new HttpClient('https://api.applicationinsights.io');
  }

  /** Set Application Insights credentials */
  configure(appId: string, apiKey: string): void {
    this.appId = appId;
    this.apiKey = apiKey;
    this.configured = true;
    this.logger.info('Application Insights service configured');
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /** Query traces related to a specific orchestration instance */
  async queryLogs(instanceId: string): Promise<LogEntry[]> {
    const query = `traces
| where customDimensions.prop__instanceId == '${instanceId}'
   or customDimensions['InstanceId'] == '${instanceId}'
| project timestamp, message, severityLevel, customDimensions
| order by timestamp asc`;

    const result = await this.executeQuery(query);
    return this.mapRows<LogEntry>(result);
  }

  /** Query exceptions, optionally filtered by orchestration instance */
  async queryExceptions(instanceId?: string): Promise<ExceptionEntry[]> {
    let query = `exceptions
| project timestamp, problemId, outerMessage, details, customDimensions`;

    if (instanceId) {
      query = `exceptions
| where customDimensions.prop__instanceId == '${instanceId}'
   or customDimensions['InstanceId'] == '${instanceId}'
| project timestamp, problemId, outerMessage, details, customDimensions`;
    }

    query += '\n| order by timestamp desc\n| take 100';

    const result = await this.executeQuery(query);
    return this.mapRows<ExceptionEntry>(result);
  }

  /** Get aggregated metrics for an orchestrator over a time range */
  async getOrchestrationMetrics(
    orchestratorName: string,
    timeRange: string,
  ): Promise<OrchestrationMetrics> {
    const query = `traces
| where timestamp > ago(${timeRange})
| where customDimensions.prop__functionName == '${orchestratorName}'
   or customDimensions['FunctionName'] == '${orchestratorName}'
| where message has 'completed' or message has 'failed'
| summarize
    totalCount = count(),
    successCount = countif(message has 'completed' and not(message has 'failed')),
    avgDuration = avg(todouble(customDimensions.prop__durationMs))
| project
    avgDurationMs = coalesce(avgDuration, 0.0),
    successRate = iff(totalCount > 0, round(100.0 * successCount / totalCount, 2), 0.0),
    throughput = totalCount`;

    const result = await this.executeQuery(query);
    const rows = this.mapRows<Record<string, unknown>>(result);

    if (rows.length === 0) {
      return { avgDurationMs: 0, successRate: 0, throughput: 0 };
    }

    const row = rows[0];
    return {
      avgDurationMs: Number(row['avgDurationMs'] ?? 0),
      successRate: Number(row['successRate'] ?? 0),
      throughput: Number(row['throughput'] ?? 0),
    };
  }

  private async executeQuery(query: string): Promise<AppInsightsQueryResult | null> {
    if (!this.configured) {
      this.logger.warn('Application Insights not configured');
      return null;
    }

    try {
      const response = await this.client.post<AppInsightsQueryResult>(
        `/v1/apps/${this.appId}/query`,
        { query },
        { 'x-api-key': this.apiKey },
      );

      if (response.statusCode !== 200) {
        this.logger.warn(`App Insights query failed: ${response.statusCode}`);
        return null;
      }

      return response.body;
    } catch (error) {
      this.logger.error('App Insights query error', error);
      return null;
    }
  }

  private mapRows<T>(result: AppInsightsQueryResult | null): T[] {
    if (!result?.tables?.length) {
      return [];
    }

    const table = result.tables[0];
    const columns = table.columns.map((c) => c.name);

    return table.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as T;
    });
  }
}
