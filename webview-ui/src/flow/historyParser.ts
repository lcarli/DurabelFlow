import type { HistoryEvent } from '../shared/types';
import type { FlowNodeData, FlowEdgeData, NodeStatus } from '../shared/messages';

/**
 * Converts Durable Functions execution history into a graph of nodes and edges.
 * Handles sequential chains, parallel fan-out/fan-in, sub-orchestrations, timers, and events.
 * Uses stable IDs based on event index to avoid graph flicker on polling updates.
 */
export function historyToFlowData(
  _orchestratorName: string,
  historyEvents: HistoryEvent[],
  runtimeStatus: string,
): { nodes: FlowNodeData[]; edges: FlowEdgeData[] } {
  const nodes: FlowNodeData[] = [];
  const edges: FlowEdgeData[] = [];

  // Filter out OrchestratorStarted/OrchestratorCompleted and other internal replay events
  // Keep the actual task lifecycle events
  const relevantEvents = historyEvents.filter((e) =>
    [
      'ExecutionStarted',
      'TaskScheduled',
      'TaskCompleted',
      'TaskFailed',
      'SubOrchestrationInstanceCreated',
      'SubOrchestrationInstanceCompleted',
      'SubOrchestrationInstanceFailed',
      'TimerCreated',
      'TimerFired',
      'EventRaised',
      'EventSent',
      'ExecutionCompleted',
      'ExecutionFailed',
      'ExecutionTerminated',
    ].includes(e.EventType),
  );

  // Build a map of scheduled tasks by their sequence index
  // Each TaskScheduled gets a unique node. TaskCompleted/TaskFailed update the matching node.
  const taskNodes = new Map<number, FlowNodeData>(); // index in scheduledOrder → node
  const scheduledOrder: { event: HistoryEvent; nodeId: string; index: number }[] = [];

  // First pass: identify all scheduled tasks and their completions
  let scheduleIndex = 0;
  const completions = new Map<string, HistoryEvent>(); // functionName → completion event (matched by order)
  const failures = new Map<string, HistoryEvent>();

  // Track which scheduled tasks have been completed, by matching order
  const scheduledByName = new Map<string, number[]>(); // name → [scheduleIndex, ...]
  const completedByName = new Map<string, number>(); // name → how many completions consumed

  for (const event of relevantEvents) {
    if (event.EventType === 'TaskScheduled') {
      const name = event.Name || event.FunctionName || 'Activity';
      const nodeId = `task-${scheduleIndex}`;
      scheduledOrder.push({ event, nodeId, index: scheduleIndex });

      if (!scheduledByName.has(name)) scheduledByName.set(name, []);
      scheduledByName.get(name)!.push(scheduleIndex);

      scheduleIndex++;
    }
  }

  // Match completions/failures to scheduled tasks by name order
  for (const event of relevantEvents) {
    if (event.EventType === 'TaskCompleted' || event.EventType === 'TaskFailed') {
      const name = event.Name || event.FunctionName || '';
      const indices = scheduledByName.get(name);
      if (indices && indices.length > 0) {
        const consumed = completedByName.get(name) || 0;
        if (consumed < indices.length) {
          const matchedIndex = indices[consumed];
          if (event.EventType === 'TaskCompleted') {
            completions.set(String(matchedIndex), event);
          } else {
            failures.set(String(matchedIndex), event);
          }
          completedByName.set(name, consumed + 1);
        }
      }
    }
  }

  // Start node
  nodes.push({
    id: 'start',
    type: 'start',
    label: 'Start',
    status: 'completed',
  });

  // Build nodes for each scheduled task
  for (const { event, nodeId, index } of scheduledOrder) {
    const name = event.Name || event.FunctionName || 'Activity';
    const completion = completions.get(String(index));
    const failure = failures.get(String(index));

    let status: NodeStatus = 'running';
    let output: unknown = undefined;
    let duration: number | undefined = undefined;

    if (completion) {
      status = 'completed';
      output = completion.Result;
      if (event.Timestamp && completion.Timestamp) {
        duration = new Date(completion.Timestamp).getTime() - new Date(event.Timestamp).getTime();
      }
    } else if (failure) {
      status = 'failed';
      output = failure.Reason;
      if (event.Timestamp && failure.Timestamp) {
        duration = new Date(failure.Timestamp).getTime() - new Date(event.Timestamp).getTime();
      }
    }

    const node: FlowNodeData = {
      id: nodeId,
      type: 'activity',
      label: name,
      status,
      input: event.Input,
      output,
      timestamp: event.Timestamp,
      duration,
      functionName: name,
    };
    nodes.push(node);
    taskNodes.set(index, node);
  }

  // Add sub-orchestrations, timers, events
  let extraIndex = 0;
  for (const event of relevantEvents) {
    switch (event.EventType) {
      case 'SubOrchestrationInstanceCreated': {
        const nodeId = `sub-orch-${extraIndex++}`;
        const completed = relevantEvents.find(
          (e) =>
            (e.EventType === 'SubOrchestrationInstanceCompleted' ||
              e.EventType === 'SubOrchestrationInstanceFailed') &&
            (!e.Name || e.Name === event.Name),
        );
        nodes.push({
          id: nodeId,
          type: 'subOrchestration',
          label: event.Name || 'Sub-Orchestration',
          status: completed
            ? completed.EventType === 'SubOrchestrationInstanceCompleted'
              ? 'completed'
              : 'failed'
            : 'running',
          input: event.Input,
          output: completed?.Result,
          timestamp: event.Timestamp,
          functionName: event.Name,
        });
        break;
      }
      case 'TimerCreated': {
        const nodeId = `timer-${extraIndex++}`;
        const fired = relevantEvents.find(
          (e) => e.EventType === 'TimerFired' && e.TimerId === event.TimerId,
        );
        const fireAt = event.FireAt || event.DurableTimerExpiration;
        nodes.push({
          id: nodeId,
          type: 'timer',
          label: fireAt ? `Timer ${formatTimerDuration(fireAt)}` : 'Timer',
          status: fired ? 'completed' : 'running',
          timestamp: event.Timestamp,
        });
        break;
      }
      case 'EventRaised': {
        const nodeId = `event-${extraIndex++}`;
        nodes.push({
          id: nodeId,
          type: 'event',
          label: event.Name || 'External Event',
          status: 'completed',
          input: event.Input,
          timestamp: event.Timestamp,
        });
        break;
      }
    }
  }

  // End node
  const endStatus = mapRuntimeToNodeStatus(runtimeStatus);
  nodes.push({
    id: 'end',
    type: 'end',
    label: runtimeStatus === 'Running' ? 'Running...' : runtimeStatus,
    status: endStatus,
  });

  // Build edges: detect sequential vs parallel blocks
  // Group consecutive TaskScheduled events without intervening completions as parallel
  buildEdges(nodes, scheduledOrder, completions, failures, relevantEvents, edges, runtimeStatus);

  return { nodes, edges };
}

function buildEdges(
  nodes: FlowNodeData[],
  scheduledOrder: { event: HistoryEvent; nodeId: string; index: number }[],
  _completions: Map<string, HistoryEvent>,
  _failures: Map<string, HistoryEvent>,
  relevantEvents: HistoryEvent[],
  edges: FlowEdgeData[],
  runtimeStatus: string,
): void {
  if (nodes.length <= 2) {
    // Only start + end
    edges.push({ id: 'edge-start-end', source: 'start', target: 'end' });
    return;
  }

  // Collect all non-start/end nodes in order of appearance
  const middleNodes = nodes.filter((n) => n.id !== 'start' && n.id !== 'end');

  // Detect parallel groups among tasks:
  // Scan through history events in order. Consecutive TaskScheduled events form a parallel group.
  const groups: string[][] = []; // each group is an array of nodeIds
  let currentGroup: string[] = [];
  let lastEventWasScheduled = false;

  // We need to track non-task nodes (timers, events, sub-orchs) by timestamp ordering
  // For simplicity, use the node order which mirrors event order
  const taskNodeIds = new Set(scheduledOrder.map((s) => s.nodeId));
  const nonTaskNodes = middleNodes.filter((n) => !taskNodeIds.has(n.id));

  // Walk the relevant events to detect parallel groups
  for (const event of relevantEvents) {
    if (event.EventType === 'TaskScheduled') {
      const name = event.Name || event.FunctionName || '';
      const scheduled = scheduledOrder.find(
        (s) => (s.event.Name || s.event.FunctionName) === name && !currentGroup.includes(s.nodeId) &&
          !groups.flat().includes(s.nodeId),
      );
      if (scheduled) {
        currentGroup.push(scheduled.nodeId);
        lastEventWasScheduled = true;
      }
    } else if (event.EventType === 'TaskCompleted' || event.EventType === 'TaskFailed') {
      if (lastEventWasScheduled && currentGroup.length > 0) {
        // End of scheduling burst — flush this group
        groups.push([...currentGroup]);
        currentGroup = [];
      }
      lastEventWasScheduled = false;
    } else if (
      event.EventType === 'SubOrchestrationInstanceCreated' ||
      event.EventType === 'TimerCreated' ||
      event.EventType === 'EventRaised'
    ) {
      // Flush current group
      if (currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
      lastEventWasScheduled = false;
      // Find matching non-task node
      const matchNode = nonTaskNodes.find(
        (n) => !groups.flat().includes(n.id) && n.label.includes(event.Name || ''),
      );
      if (matchNode) {
        groups.push([matchNode.id]);
      }
    }
  }
  // Flush remaining
  if (currentGroup.length > 0) {
    groups.push([...currentGroup]);
  }

  // Any non-task nodes not yet in groups, add them at the end
  for (const n of nonTaskNodes) {
    if (!groups.flat().includes(n.id)) {
      groups.push([n.id]);
    }
  }

  // Now build edges: start → group1 → group2 → ... → end
  let previousSources = ['start'];

  for (const group of groups) {
    if (group.length === 1) {
      // Sequential: connect all previous sources to this node
      for (const prev of previousSources) {
        edges.push({
          id: `edge-${prev}-${group[0]}`,
          source: prev,
          target: group[0],
        });
      }
      previousSources = [group[0]];
    } else {
      // Parallel: fan out from previous, fan in with a join
      for (const nodeId of group) {
        for (const prev of previousSources) {
          edges.push({
            id: `edge-${prev}-${nodeId}`,
            source: prev,
            target: nodeId,
          });
        }
      }
      // All parallel nodes become the previous sources (fan-in will connect to next)
      previousSources = group;
    }
  }

  // Connect last group to end
  for (const prev of previousSources) {
    edges.push({
      id: `edge-${prev}-end`,
      source: prev,
      target: 'end',
      animated: runtimeStatus === 'Running',
    });
  }
}

function mapRuntimeToNodeStatus(runtimeStatus: string): NodeStatus {
  switch (runtimeStatus) {
    case 'Running':
    case 'Pending':
      return 'running';
    case 'Completed':
    case 'ContinuedAsNew':
      return 'completed';
    case 'Failed':
      return 'failed';
    case 'Terminated':
    case 'Canceled':
      return 'failed';
    case 'Suspended':
      return 'waiting';
    default:
      return 'pending';
  }
}

function formatTimerDuration(fireAt: string): string {
  try {
    const target = new Date(fireAt);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return 'fired';
    if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
    if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
    return `${Math.round(diffMs / 3600000)}h`;
  } catch {
    return '';
  }
}
