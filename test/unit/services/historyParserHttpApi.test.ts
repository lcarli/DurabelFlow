import { describe, it, expect } from 'vitest';
import { historyToFlowData, normalizeHistory } from '../../../webview-ui/src/flow/historyParser';
import type { HistoryEvent } from '../../../webview-ui/src/shared/types';

// Shape captured from a real Functions host (HTTP API, showHistory=true): only completion
// events are returned, each carrying ScheduledTime. No TaskScheduled / SubOrchestrationInstanceCreated.
const httpApiHistory: HistoryEvent[] = [
  { EventType: 'ExecutionStarted', Timestamp: '2026-11-04T21:58:28.184Z', FunctionName: 'OrderOrchestrator' },
  { EventType: 'TaskCompleted', Timestamp: '2026-11-04T21:58:30.227Z', ScheduledTime: '2026-11-04T16:58:29.482-05:00', FunctionName: 'ValidateOrder', Result: { valid: true } },
  { EventType: 'TaskCompleted', Timestamp: '2026-11-04T21:58:32.129Z', ScheduledTime: '2026-11-04T16:58:31.159-05:00', FunctionName: 'ReserveStock' },
  { EventType: 'TaskCompleted', Timestamp: '2026-11-04T21:58:32.287Z', ScheduledTime: '2026-11-04T16:58:31.158-05:00', FunctionName: 'ReserveStock' },
  { EventType: 'TaskCompleted', Timestamp: '2026-11-04T21:58:32.288Z', ScheduledTime: '2026-11-04T16:58:31.158-05:00', FunctionName: 'ReserveStock' },
  { EventType: 'TaskCompleted', Timestamp: '2026-11-04T21:58:32.806Z', ScheduledTime: '2026-11-04T16:58:32.340-05:00', FunctionName: 'ChargePayment' },
  { EventType: 'TimerCreated', Timestamp: '2026-11-04T21:58:32.852Z' },
  { EventType: 'TimerFired', Timestamp: '2026-11-04T21:58:32.852Z', FireAt: '2026-11-04T21:58:34.832Z' },
  { EventType: 'SubOrchestrationInstanceCompleted', Timestamp: '2026-11-04T21:58:36.733Z', ScheduledTime: '2026-11-04T16:58:35.116-05:00', FunctionName: 'ShipOrderOrchestrator', Result: 'ok' },
  { EventType: 'ExecutionCompleted', Timestamp: '2026-11-04T21:58:36.822Z' },
];

describe('historyToFlowData with completion-only history (HTTP API)', () => {
  it('builds activity and sub-orchestration nodes from completion events', () => {
    const { nodes } = historyToFlowData('OrderOrchestrator', httpApiHistory, 'Completed');

    const labels = nodes.filter((n) => n.type === 'activity').map((n) => n.label);
    expect(labels).toEqual(['ValidateOrder', 'ReserveStock', 'ReserveStock', 'ReserveStock', 'ChargePayment']);
    expect(nodes.find((n) => n.type === 'subOrchestration')?.label).toBe('ShipOrderOrchestrator');
    expect(nodes.filter((n) => n.type === 'timer')).toHaveLength(1);
    expect(nodes.filter((n) => n.type === 'activity').every((n) => n.status === 'completed')).toBe(true);
  });

  it('detects the fan-out as parallel branches', () => {
    const { nodes, edges } = historyToFlowData('OrderOrchestrator', httpApiHistory, 'Completed');

    const validate = nodes.find((n) => n.label === 'ValidateOrder')!;
    const stock = nodes.filter((n) => n.label === 'ReserveStock');
    const charge = nodes.find((n) => n.label === 'ChargePayment')!;

    for (const s of stock) {
      expect(edges.some((e) => e.source === validate.id && e.target === s.id)).toBe(true);
      expect(edges.some((e) => e.source === s.id && e.target === charge.id)).toBe(true);
    }
  });

  it('marks TaskFailed attempts as failed and pairs one timer per retry', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2026-01-01T00:00:00Z' },
      { EventType: 'TaskFailed', Timestamp: '2026-01-01T00:00:02Z', ScheduledTime: '2026-01-01T00:00:01Z', FunctionName: 'ChargePayment', Reason: 'boom' },
      { EventType: 'TimerCreated', Timestamp: '2026-01-01T00:00:03Z' },
      { EventType: 'TimerFired', Timestamp: '2026-01-01T00:00:03Z', FireAt: '2026-01-01T00:00:03Z' },
      { EventType: 'TaskFailed', Timestamp: '2026-01-01T00:00:05Z', ScheduledTime: '2026-01-01T00:00:04Z', FunctionName: 'ChargePayment', Reason: 'boom' },
    ];

    const { nodes } = historyToFlowData('Orch', history, 'Failed');

    expect(nodes.filter((n) => n.type === 'activity').map((n) => n.status)).toEqual(['failed', 'failed']);
    expect(nodes.filter((n) => n.type === 'timer')).toHaveLength(1);
  });
});

describe('normalizeHistory', () => {
  it('is idempotent', () => {
    const once = normalizeHistory(httpApiHistory);
    expect(normalizeHistory(once)).toEqual(once);
  });

  it('leaves full histories (with TaskScheduled) untouched', () => {
    const full: HistoryEvent[] = [
      { EventType: 'TaskScheduled', Timestamp: '2024-01-01T00:00:01Z', Name: 'A' },
      { EventType: 'TaskCompleted', Timestamp: '2024-01-01T00:00:02Z', Name: 'A' },
    ];
    expect(normalizeHistory(full)).toBe(full);
  });
});
