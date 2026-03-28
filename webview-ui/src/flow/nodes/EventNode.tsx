import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '../../shared/messages';
import { statusColors } from '../../shared/theme';

function getStatusStyle(status: NodeStatus): React.CSSProperties {
  const color = statusColors[status];
  return {
    borderColor: color,
    backgroundColor: `${color}18`,
  };
}

export const EventNode = memo(({ data }: { data: { label: string; status: NodeStatus } }) => {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: '4px',
        border: '2px dashed',
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        fontSize: '12px',
        minWidth: '120px',
        textAlign: 'center',
        transition: 'all 0.3s ease',
        ...getStatusStyle(data.status),
      }}
      title={`Event: ${data.label}\nStatus: ${data.status}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: statusColors[data.status] }} />
      <div style={{ fontWeight: 600, marginBottom: '2px' }}>📨 {data.label}</div>
      <div style={{ fontSize: '10px', opacity: 0.8 }}>{data.status}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: statusColors[data.status] }} />
    </div>
  );
});

EventNode.displayName = 'EventNode';
