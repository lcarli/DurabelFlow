import type { HistoryEvent } from '../shared/types';

export interface ReplayIteration {
  index: number;
  events: HistoryEvent[];
  newEvents: HistoryEvent[];
  replayedEvents: HistoryEvent[];
}

/**
 * Groups history events into replay iterations.
 *
 * The Durable Functions replay mechanism works by re-executing the orchestrator
 * each time an activity completes. We detect replay boundaries by looking at:
 * 1. `OrchestratorStarted` events (if present in the history)
 * 2. `IsPlayed` flag on events (replayed events have IsPlayed=true)
 * 3. Falling back to grouping by activity completion patterns
 */
export function parseReplayIterations(historyEvents: HistoryEvent[]): ReplayIteration[] {
  if (!historyEvents || historyEvents.length === 0) {
    return [];
  }

  // Check if OrchestratorStarted events exist
  const hasOrchestratorStarted = historyEvents.some(
    (e) => e.EventType === 'OrchestratorStarted',
  );

  if (hasOrchestratorStarted) {
    return parseByOrchestratorStarted(historyEvents);
  }

  // Fallback: infer replay iterations from the event flow
  // Each "iteration" corresponds to: all replayed events + new events until next activity completes
  return parseByActivityBoundaries(historyEvents);
}

function parseByOrchestratorStarted(historyEvents: HistoryEvent[]): ReplayIteration[] {
  const iterations: ReplayIteration[] = [];
  let currentEvents: HistoryEvent[] = [];
  let iterationIndex = 0;

  for (const event of historyEvents) {
    if (event.EventType === 'OrchestratorStarted' && currentEvents.length > 0) {
      iterations.push(buildIteration(iterationIndex, currentEvents));
      iterationIndex++;
      currentEvents = [];
    }
    currentEvents.push(event);
  }

  if (currentEvents.length > 0) {
    iterations.push(buildIteration(iterationIndex, currentEvents));
  }

  return iterations;
}

/**
 * Infer replay iterations from the activity lifecycle.
 *
 * Logic: Each time a TaskCompleted/TaskFailed appears, it marks the end of one
 * orchestrator replay. The next TaskScheduled (if any) starts a new replay.
 *
 * Iteration 0: ExecutionStarted → TaskScheduled(A)
 * Iteration 1: TaskCompleted(A) → TaskScheduled(B)
 * Iteration 2: TaskCompleted(B) → TaskScheduled(C)
 * ...
 */
function parseByActivityBoundaries(historyEvents: HistoryEvent[]): ReplayIteration[] {
  const iterations: ReplayIteration[] = [];
  let currentEvents: HistoryEvent[] = [];
  let iterationIndex = 0;
  let lastWasCompletion = false;

  for (const event of historyEvents) {
    const isCompletion =
      event.EventType === 'TaskCompleted' ||
      event.EventType === 'TaskFailed' ||
      event.EventType === 'SubOrchestrationInstanceCompleted' ||
      event.EventType === 'SubOrchestrationInstanceFailed' ||
      event.EventType === 'TimerFired';

    const isNewSchedule =
      event.EventType === 'TaskScheduled' ||
      event.EventType === 'SubOrchestrationInstanceCreated' ||
      event.EventType === 'TimerCreated';

    // Start a new iteration when we see a new schedule after a completion
    if (isNewSchedule && lastWasCompletion && currentEvents.length > 0) {
      iterations.push(buildIterationFromFlow(iterationIndex, currentEvents, iterations));
      iterationIndex++;
      currentEvents = [];
    }

    currentEvents.push(event);
    lastWasCompletion = isCompletion;
  }

  if (currentEvents.length > 0) {
    iterations.push(buildIterationFromFlow(iterationIndex, currentEvents, iterations));
  }

  return iterations;
}

function buildIteration(index: number, events: HistoryEvent[]): ReplayIteration {
  const replayedEvents = events.filter((e) => e.IsPlayed === true);
  const newEvents = events.filter((e) => e.IsPlayed !== true);
  return { index, events, newEvents, replayedEvents };
}

/**
 * Build iteration inferring replayed vs new.
 * Events that appeared in previous iterations are "replayed" in this one.
 */
function buildIterationFromFlow(
  index: number,
  events: HistoryEvent[],
  previousIterations: ReplayIteration[],
): ReplayIteration {
  // If IsPlayed flags are available, use them
  const hasIsPlayed = events.some((e) => e.IsPlayed !== undefined);
  if (hasIsPlayed) {
    return buildIteration(index, events);
  }

  // Otherwise infer: events from previous iterations are "replayed"
  const previousEventKeys = new Set<string>();
  for (const iter of previousIterations) {
    for (const evt of iter.events) {
      previousEventKeys.add(evtKey(evt));
    }
  }

  const replayedEvents: HistoryEvent[] = [];
  const newEvents: HistoryEvent[] = [];
  for (const evt of events) {
    if (previousEventKeys.has(evtKey(evt))) {
      replayedEvents.push(evt);
    } else {
      newEvents.push(evt);
    }
  }

  return { index, events, newEvents, replayedEvents };
}

function evtKey(evt: HistoryEvent): string {
  return `${evt.EventType}:${evt.Name || evt.FunctionName || ''}:${evt.Timestamp}`;
}
