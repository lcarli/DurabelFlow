export type OrchestrationRuntimeStatus =
  | 'Running'
  | 'Completed'
  | 'ContinuedAsNew'
  | 'Failed'
  | 'Canceled'
  | 'Terminated'
  | 'Pending'
  | 'Suspended';

export interface OrchestrationInstance {
  instanceId: string;
  name: string;
  runtimeStatus: OrchestrationRuntimeStatus;
  input: unknown;
  customStatus: unknown;
  output: unknown;
  createdTime: string;
  lastUpdatedTime: string;
  historyEvents?: HistoryEvent[];
}

export interface HistoryEvent {
  EventType: string;
  Timestamp: string;
  FunctionName?: string;
  ScheduledTime?: string;
  Result?: unknown;
  Input?: unknown;
  Name?: string;
  InstanceId?: string;
  Reason?: string;
  IsPlayed?: boolean;
  DurableTimerExpiration?: string;
  FireAt?: string;
  TimerId?: string;
}
