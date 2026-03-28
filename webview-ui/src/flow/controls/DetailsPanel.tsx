import React, { useState } from 'react';
import type { FlowNodeData } from '../../shared/messages';

interface DetailsPanelProps {
  node: FlowNodeData | null;
  onClose: () => void;
  onNavigateToCode: (functionName: string) => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  zIndex: 10,
  width: '300px',
  maxHeight: '400px',
  overflowY: 'auto',
  background: 'var(--vscode-editorWidget-background, #252526)',
  border: '1px solid var(--vscode-editorWidget-border, #444)',
  borderRadius: '6px',
  padding: '12px',
  fontFamily: 'var(--vscode-font-family, sans-serif)',
  fontSize: '12px',
  color: 'var(--vscode-editor-foreground, #ccc)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

export function DetailsPanel({ node, onClose, onNavigateToCode }: DetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');

  if (!node) return null;

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>{node.label}</strong>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: '8px', fontSize: '11px', opacity: 0.8 }}>
        <div>Type: {node.type}</div>
        <div>Status: {node.status}</div>
        {node.duration !== undefined && <div>Duration: {formatDuration(node.duration)}</div>}
        {node.timestamp && <div>Time: {new Date(node.timestamp).toLocaleTimeString()}</div>}
        {node.retryCount !== undefined && node.retryCount > 0 && (
          <div>Retries: {node.retryCount}</div>
        )}
      </div>

      {node.functionName && (
        <button
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background: 'var(--vscode-button-background, #0078d4)',
            color: 'var(--vscode-button-foreground, #fff)',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            marginBottom: '8px',
            width: '100%',
          }}
          onClick={() => onNavigateToCode(node.functionName!)}
        >
          📄 Go to Code
        </button>
      )}

      {(node.input !== undefined || node.output !== undefined) && (
        <>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            <TabButton active={activeTab === 'input'} onClick={() => setActiveTab('input')}>
              Input
            </TabButton>
            <TabButton active={activeTab === 'output'} onClick={() => setActiveTab('output')}>
              Output
            </TabButton>
          </div>

          <pre
            style={{
              background: 'var(--vscode-textCodeBlock-background, #1e1e1e)',
              padding: '8px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '150px',
              fontSize: '11px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {formatJson(activeTab === 'input' ? node.input : node.output)}
          </pre>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        fontSize: '10px',
        border: '1px solid var(--vscode-button-border, #444)',
        borderRadius: '3px',
        background: active ? 'var(--vscode-button-background, #0078d4)' : 'transparent',
        color: active ? 'var(--vscode-button-foreground, #fff)' : 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
