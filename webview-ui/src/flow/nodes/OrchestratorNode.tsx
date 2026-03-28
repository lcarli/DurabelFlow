import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '../../shared/messages';
import { statusColors } from '../../shared/theme';

function getStatusStyle(status: NodeStatus): React.CSSProperties {
  const color = statusColors[status];
  return {
    borderColor: color,
    backgroundColor: `${color}18`,
    boxShadow: status === 'running' ? `0 0 16px ${color}60` : 'none',
  };
}

export const OrchestratorNode = memo(({ data }: { data: { label: string; status: NodeStatus } }) => {
  return (
    <div
      style={{
        padding: '12px 20px',
        borderRadius: '12px',
        border: '3px solid',
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        fontSize: '13px',
        minWidth: '160px',
        textAlign: 'center',
        transition: 'all 0.3s ease',
        ...getStatusStyle(data.status),
      }}
      title={`Orchestrator: ${data.label}\nStatus: ${data.status}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: statusColors[data.status] }} />
      <div style={{ fontWeight: 700, marginBottom: '4px' }}>🎭 {data.label}</div>
      <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.status}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: statusColors[data.status] }} />
    </div>
  );
});

OrchestratorNode.displayName = 'OrchestratorNode';
