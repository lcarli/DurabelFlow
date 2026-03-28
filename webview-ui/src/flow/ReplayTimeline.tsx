import { useState } from 'react';
import type { HistoryEvent } from '../shared/types';
import { parseReplayIterations, type ReplayIteration } from './replayParser';

const REPLAYED_COLOR = '#6f42c1'; // purple – matches statusColors.replaying
const NEW_COLOR = '#0d6efd'; // blue – matches statusColors.running

interface ReplayTimelineProps {
  historyEvents: HistoryEvent[];
}

export function ReplayTimeline({ historyEvents }: ReplayTimelineProps) {
  const iterations = parseReplayIterations(historyEvents);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (iterations.length === 0) {
    return (
      <div style={styles.empty}>
        No replay data available yet. The Durable Functions runtime re-executes your orchestrator code each time an activity completes — start an orchestration to see replay iterations here.
      </div>
    );
  }

  const selected = selectedIdx !== null ? iterations[selectedIdx] : null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontWeight: 600 }}>🔁 Replay Inspector</span>
        <span style={styles.counter}>
          {iterations.length} replay {iterations.length === 1 ? 'iteration' : 'iterations'}
        </span>
      </div>

      {/* Explanation */}
      <div style={{ padding: '6px 12px', fontSize: 11, opacity: 0.7, borderBottom: '1px solid var(--vscode-panel-border, #333)' }}>
        The Durable Functions runtime re-executes your orchestrator code each time an activity completes. This view shows each replay iteration.
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <LegendDot color={REPLAYED_COLOR} label="Replayed (IsPlayed)" />
        <LegendDot color={NEW_COLOR} label="New" />
      </div>

      {/* Timeline rows */}
      <div style={styles.timeline}>
        {iterations.map((iter) => (
          <ReplayRow
            key={iter.index}
            iteration={iter}
            total={iterations.length}
            isSelected={selectedIdx === iter.index}
            onSelect={() => setSelectedIdx(selectedIdx === iter.index ? null : iter.index)}
          />
        ))}
      </div>

      {/* Detail panel */}
      {selected && <IterationDetail iteration={selected} total={iterations.length} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ReplayRow({
  iteration,
  total,
  isSelected,
  onSelect,
}: {
  iteration: ReplayIteration;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { index, events, replayedEvents, newEvents } = iteration;
  const replayPct = events.length > 0 ? (replayedEvents.length / events.length) * 100 : 0;
  const newPct = 100 - replayPct;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.row,
        ...(isSelected ? styles.rowSelected : {}),
      }}
    >
      {/* Label */}
      <span style={styles.rowLabel}>
        Replay {index + 1} of {total}
      </span>

      {/* Bar */}
      <div style={styles.bar}>
        {replayPct > 0 && (
          <div
            style={{
              ...styles.barSegment,
              width: `${replayPct}%`,
              backgroundColor: REPLAYED_COLOR,
              borderRadius: newPct === 0 ? '3px' : '3px 0 0 3px',
            }}
          />
        )}
        {newPct > 0 && (
          <div
            style={{
              ...styles.barSegment,
              width: `${newPct}%`,
              backgroundColor: NEW_COLOR,
              borderRadius: replayPct === 0 ? '3px' : '0 3px 3px 0',
            }}
          />
        )}
      </div>

      {/* Counts */}
      <span style={styles.rowCounts}>
        <span style={{ color: REPLAYED_COLOR }}>{replayedEvents.length}R</span>
        {' / '}
        <span style={{ color: NEW_COLOR }}>{newEvents.length}N</span>
      </span>
    </button>
  );
}

function IterationDetail({
  iteration,
  total,
}: {
  iteration: ReplayIteration;
  total: number;
}) {
  return (
    <div style={styles.detail}>
      <div style={styles.detailHeader}>
        Replay {iteration.index + 1} of {total} — {iteration.events.length} events
      </div>
      <div style={styles.eventList}>
        {iteration.events.map((evt, i) => {
          const isReplayed = evt.IsPlayed === true;
          return (
            <div
              key={`${evt.EventType}-${evt.Timestamp}-${i}`}
              style={{
                ...styles.eventRow,
                borderLeft: `3px solid ${isReplayed ? REPLAYED_COLOR : NEW_COLOR}`,
              }}
            >
              <span style={styles.eventType}>{evt.EventType}</span>
              {evt.FunctionName && (
                <span style={styles.eventFn}>{evt.FunctionName}</span>
              )}
              {evt.Name && !evt.FunctionName && (
                <span style={styles.eventFn}>{evt.Name}</span>
              )}
              <span style={styles.eventTag}>
                {isReplayed ? 'replayed' : 'new'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles – all using VSCode CSS variables for theming                */
/* ------------------------------------------------------------------ */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    fontSize: 12,
    color: 'var(--vscode-editor-foreground, #ccc)',
    background: 'var(--vscode-editor-background, #1e1e1e)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, #333)',
    background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
  },
  counter: {
    opacity: 0.7,
    fontSize: 11,
  },
  legend: {
    display: 'flex',
    gap: 16,
    padding: '6px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, #333)',
  },
  timeline: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '5px 12px',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  rowSelected: {
    background: 'var(--vscode-list-activeSelectionBackground, #094771)',
  },
  rowLabel: {
    whiteSpace: 'nowrap',
    minWidth: 100,
    fontWeight: 500,
  },
  bar: {
    flex: 1,
    display: 'flex',
    height: 8,
    borderRadius: 3,
    overflow: 'hidden',
    background: 'var(--vscode-input-background, #333)',
  },
  barSegment: {
    height: '100%',
    transition: 'width 0.2s ease',
  },
  rowCounts: {
    whiteSpace: 'nowrap',
    fontSize: 11,
    minWidth: 60,
    textAlign: 'right' as const,
  },
  detail: {
    borderTop: '1px solid var(--vscode-panel-border, #333)',
    maxHeight: '40%',
    overflowY: 'auto',
  },
  detailHeader: {
    padding: '6px 12px',
    fontWeight: 600,
    background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
    position: 'sticky' as const,
    top: 0,
  },
  eventList: {
    padding: '4px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  eventRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '2px 6px',
    borderRadius: 2,
  },
  eventType: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontWeight: 500,
  },
  eventFn: {
    opacity: 0.7,
    fontSize: 11,
  },
  eventTag: {
    marginLeft: 'auto',
    fontSize: 10,
    opacity: 0.6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    opacity: 0.6,
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    color: 'var(--vscode-editor-foreground, #ccc)',
    padding: 20,
    textAlign: 'center' as const,
  },
};
