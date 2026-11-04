import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from './flow/FlowCanvas';
import { ReplayTimeline } from './flow/ReplayTimeline';
import { historyToFlowData, normalizeHistory } from './flow/historyParser';
import type { ExtensionMessage, FlowNodeData, FlowEdgeData } from './shared/messages';
import type { HistoryEvent } from './shared/types';
import { postMessage } from './shared/vscodeApi';

type ViewTab = 'flow' | 'replay';

export default function App() {
  const [flowNodes, setFlowNodes] = useState<FlowNodeData[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdgeData[]>([]);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string>('');
  const [instanceStatus, setInstanceStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ViewTab>('flow');

  // Accumulate history events across polling updates
  // The Durable Task API may return partial history during replay
  const accumulatedHistory = useState<Map<string, HistoryEvent>>(new Map())[0];

  useEffect(() => {
    // Notify extension that WebView is ready
    postMessage({ type: 'ready' });

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'instanceUpdate': {
          const { instance } = message;
          setInstanceName(instance.name);
          setInstanceStatus(instance.runtimeStatus);

          if (instance.historyEvents && instance.historyEvents.length > 0) {
            // Merge new events into accumulated history using a unique key per event
            for (const evt of instance.historyEvents) {
              const key = eventKey(evt);
              const existing = accumulatedHistory.get(key);
              // Update if new event has more info (e.g., completion) or doesn't exist yet
              if (!existing || isMoreComplete(evt, existing)) {
                accumulatedHistory.set(key, evt);
              }
            }

            // Convert accumulated map back to sorted array (completion-only history is expanded
            // with the TaskScheduled events the HTTP API omits)
            const mergedEvents = normalizeHistory(
              Array.from(accumulatedHistory.values()).sort(
                (a, b) => new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime(),
              ),
            );

            setHistoryEvents(mergedEvents);

            const { nodes, edges } = historyToFlowData(
              instance.name,
              mergedEvents,
              instance.runtimeStatus,
            );

            setFlowNodes(nodes);
            setFlowEdges(edges);
          }
          break;
        }

        case 'flowData': {
          setFlowNodes(message.nodes);
          setFlowEdges(message.edges);
          break;
        }

        case 'error': {
          setError(message.message);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (error) {
    return (
      <div
        style={{
          padding: '20px',
          color: 'var(--vscode-errorForeground, #f44)',
          fontFamily: 'var(--vscode-font-family, sans-serif)',
        }}
      >
        <h3>Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (flowNodes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'var(--vscode-font-family, sans-serif)',
          color: 'var(--vscode-editor-foreground, #ccc)',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '48px' }}>🎭</div>
        <h2 style={{ margin: 0 }}>DurableFlow</h2>
        <p style={{ opacity: 0.7, textAlign: 'center', maxWidth: '400px' }}>
          Start an orchestration to see the visual execution flow here.
          <br />
          Use the sidebar or Command Palette to begin.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {/* Header bar */}
      <div
        style={{
          padding: '6px 12px',
          fontSize: '12px',
          fontFamily: 'var(--vscode-font-family, sans-serif)',
          background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
          borderBottom: '1px solid var(--vscode-editorGroupHeader-tabsBorder, #333)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: 'var(--vscode-editor-foreground, #ccc)',
        }}
      >
        <span style={{ fontWeight: 600 }}>🎭 {instanceName}</span>
        <StatusBadge status={instanceStatus} />
        <span style={{ opacity: 0.6 }}>{flowNodes.length} nodes</span>

        {/* Tab toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <TabButton label="Flow" isActive={activeTab === 'flow'} onClick={() => setActiveTab('flow')} />
          <TabButton
            label="🔁 Inspector"
            isActive={activeTab === 'replay'}
            onClick={() => setActiveTab('replay')}
            title="Replay Inspector — view each replay iteration of your orchestrator"
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ width: '100%', height: 'calc(100vh - 32px)' }}>
        {activeTab === 'flow' ? (
          <ReactFlowProvider>
            <FlowCanvas flowNodes={flowNodes} flowEdges={flowEdges} />
          </ReactFlowProvider>
        ) : (
          <ReplayTimeline historyEvents={historyEvents} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Running: '#0d6efd',
    Completed: '#198754',
    Failed: '#dc3545',
    Terminated: '#dc3545',
    Pending: '#6c757d',
    Suspended: '#ffc107',
  };

  return (
    <span
      style={{
        padding: '1px 8px',
        borderRadius: '10px',
        fontSize: '10px',
        fontWeight: 600,
        background: `${colors[status] || '#555'}30`,
        color: colors[status] || '#888',
        border: `1px solid ${colors[status] || '#555'}`,
      }}
    >
      {status}
    </span>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
  title,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '2px 10px',
        fontSize: '11px',
        fontFamily: 'inherit',
        border: '1px solid var(--vscode-button-border, #555)',
        borderRadius: '3px',
        cursor: 'pointer',
        background: isActive
          ? 'var(--vscode-button-background, #0d6efd)'
          : 'transparent',
        color: isActive
          ? 'var(--vscode-button-foreground, #fff)'
          : 'var(--vscode-editor-foreground, #ccc)',
      }}
    >
      {label}
    </button>
  );
}

/**
 * Generate a unique key for a history event to enable deduplication across polls.
 */
function eventKey(evt: HistoryEvent): string {
  const name = evt.Name || evt.FunctionName || '';
  return `${evt.EventType}:${name}:${evt.Timestamp}`;
}

/**
 * Check if event `a` is more complete than event `b`.
 */
function isMoreComplete(a: HistoryEvent, b: HistoryEvent): boolean {
  if (a.Result !== undefined && b.Result === undefined) return true;
  if (a.Reason !== undefined && b.Reason === undefined) return true;
  return false;
}
