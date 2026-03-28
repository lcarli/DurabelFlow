import type { OrchestrationInstance, HistoryEvent } from './types';

/** Messages from Extension → WebView */
export type ExtensionMessage =
  | { type: 'instanceUpdate'; instance: OrchestrationInstance }
  | { type: 'flowData'; nodes: FlowNodeData[]; edges: FlowEdgeData[] }
  | { type: 'themeChanged'; kind: 'light' | 'dark' | 'highContrast' }
  | { type: 'error'; message: string };

/** Messages from WebView → Extension */
export type WebViewMessage =
  | { type: 'ready' }
  | { type: 'requestInstanceStatus'; instanceId: string }
  | { type: 'navigateToCode'; functionName: string }
  | { type: 'startPolling'; instanceId: string }
  | { type: 'stopPolling' }
  | { type: 'exportDiagram'; format: 'png' | 'svg' }
  | { type: 'raiseEvent'; instanceId: string; eventName: string; eventData?: unknown }
  | { type: 'terminateInstance'; instanceId: string };

export interface FlowNodeData {
  id: string;
  type: 'activity' | 'orchestrator' | 'subOrchestration' | 'timer' | 'event' | 'start' | 'end';
  label: string;
  status: NodeStatus;
  input?: unknown;
  output?: unknown;
  timestamp?: string;
  duration?: number;
  retryCount?: number;
  functionName?: string;
}

export interface FlowEdgeData {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
}

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting'
  | 'replaying';

export type { OrchestrationInstance, HistoryEvent };
