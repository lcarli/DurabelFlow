import { describe, it, expect } from 'vitest';
import { historyToFlowData } from '../../../webview-ui/src/flow/historyParser';
import type { HistoryEvent } from '../../../webview-ui/src/shared/types';

describe('historyToFlowData', () => {
  it('should create start and end nodes for empty history', () => {
    const { nodes, edges } = historyToFlowData('MyOrch', [], 'Completed');

    expect(nodes.length).toBe(2);
    expect(nodes[0].type).toBe('start');
    expect(nodes[1].type).toBe('end');
    expect(edges.length).toBe(1);
  });

  it('should create activity nodes for TaskScheduled events', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
      { EventType: 'TaskScheduled', Timestamp: '2024-01-01T00:00:01Z', Name: 'SayHello' },
      {
        EventType: 'TaskCompleted',
        Timestamp: '2024-01-01T00:00:02Z',
        Name: 'SayHello',
        Result: '"Hello!"',
      },
    ];

    const { nodes, edges } = historyToFlowData('MyOrch', history, 'Completed');

    const activityNodes = nodes.filter((n) => n.type === 'activity');
    expect(activityNodes.length).toBeGreaterThanOrEqual(1);
    expect(activityNodes[0].label).toBe('SayHello');
    expect(activityNodes[0].status).toBe('completed');
  });

  it('should mark failed tasks', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
      { EventType: 'TaskScheduled', Timestamp: '2024-01-01T00:00:01Z', Name: 'FailingTask' },
      {
        EventType: 'TaskFailed',
        Timestamp: '2024-01-01T00:00:02Z',
        Name: 'FailingTask',
        Reason: 'Something went wrong',
      },
    ];

    const { nodes } = historyToFlowData('MyOrch', history, 'Failed');

    const failedNode = nodes.find((n) => n.label === 'FailingTask');
    expect(failedNode?.status).toBe('failed');
  });

  it('should create timer nodes', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
      {
        EventType: 'TimerCreated',
        Timestamp: '2024-01-01T00:00:01Z',
        FireAt: '2024-01-01T00:05:00Z',
      },
      { EventType: 'TimerFired', Timestamp: '2024-01-01T00:05:00Z' },
    ];

    const { nodes } = historyToFlowData('MyOrch', history, 'Completed');

    const timerNodes = nodes.filter((n) => n.type === 'timer');
    expect(timerNodes.length).toBe(1);
    expect(timerNodes[0].status).toBe('completed');
  });

  it('should create event nodes for EventRaised', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
      {
        EventType: 'EventRaised',
        Timestamp: '2024-01-01T00:01:00Z',
        Name: 'ApprovalEvent',
        Input: '{"approved": true}',
      },
    ];

    const { nodes } = historyToFlowData('MyOrch', history, 'Completed');

    const eventNodes = nodes.filter((n) => n.type === 'event');
    expect(eventNodes.length).toBe(1);
    expect(eventNodes[0].label).toBe('ApprovalEvent');
  });

  it('should create sub-orchestration nodes', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
      {
        EventType: 'SubOrchestrationInstanceCreated',
        Timestamp: '2024-01-01T00:00:01Z',
        Name: 'ChildOrch',
      },
      {
        EventType: 'SubOrchestrationInstanceCompleted',
        Timestamp: '2024-01-01T00:00:05Z',
        Result: '"done"',
      },
    ];

    const { nodes } = historyToFlowData('MyOrch', history, 'Completed');

    const subOrchNodes = nodes.filter((n) => n.type === 'subOrchestration');
    expect(subOrchNodes.length).toBe(1);
    expect(subOrchNodes[0].label).toBe('ChildOrch');
    expect(subOrchNodes[0].status).toBe('completed');
  });

  it('should set end node status based on runtime status', () => {
    const history: HistoryEvent[] = [
      { EventType: 'ExecutionStarted', Timestamp: '2024-01-01T00:00:00Z' },
    ];

    const runningResult = historyToFlowData('MyOrch', history, 'Running');
    const endNode = runningResult.nodes.find((n) => n.type === 'end');
    expect(endNode?.status).toBe('running');
    expect(endNode?.label).toBe('Running...');

    const failedResult = historyToFlowData('MyOrch', history, 'Failed');
    const failedEnd = failedResult.nodes.find((n) => n.type === 'end');
    expect(failedEnd?.status).toBe('failed');
  });
});
