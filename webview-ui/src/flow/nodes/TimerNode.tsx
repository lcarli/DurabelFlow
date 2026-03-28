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

export const TimerNode = memo(({ data }: { data: { label: string; status: NodeStatus } }) => {
  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: '50%',
        border: '2px solid',
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        fontSize: '11px',
        width: '80px',
        height: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        ...getStatusStyle(data.status),
      }}
      title={`Timer: ${data.label}\nStatus: ${data.status}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: statusColors[data.status] }} />
      <div style={{ fontSize: '16px' }}>⏱</div>
      <div style={{ fontSize: '9px', marginTop: '2px' }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: statusColors[data.status] }} />
    </div>
  );
});

TimerNode.displayName = 'TimerNode';
