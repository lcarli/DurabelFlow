import { memo, type CSSProperties } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '../../shared/messages';
import { statusColors } from '../../shared/theme';

const nodeStyles: Record<string, CSSProperties> = {
  base: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '2px solid',
    fontFamily: 'var(--vscode-font-family, sans-serif)',
    fontSize: '12px',
    minWidth: '140px',
    textAlign: 'center',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  label: {
    fontWeight: 600,
    marginBottom: '4px',
  },
  meta: {
    fontSize: '10px',
    opacity: 0.8,
  },
};

function getStatusStyle(status: NodeStatus): CSSProperties {
  const color = statusColors[status];
  return {
    borderColor: color,
    backgroundColor: `${color}18`,
    boxShadow: status === 'running' ? `0 0 12px ${color}60` : 'none',
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

interface ActivityNodeProps {
  data: {
    label: string;
    status: NodeStatus;
    duration?: number;
    retryCount?: number;
    onClick?: (data: ActivityNodeProps['data']) => void;
    [key: string]: unknown;
  };
}

export const ActivityNode = memo(({ data }: ActivityNodeProps) => {
  const durationStr = typeof data.duration === 'number' ? formatDuration(data.duration) : '';
  return (
    <div
      style={{ ...nodeStyles.base, ...getStatusStyle(data.status) }}
      onClick={() => data.onClick?.(data)}
      title={`${data.label}\nStatus: ${data.status}${durationStr ? '\nDuration: ' + durationStr : ''}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: statusColors[data.status] }} />
      <div style={nodeStyles.label}>⚡ {data.label}</div>
      <div style={nodeStyles.meta}>
        {data.status}
        {typeof data.duration === 'number' && ` • ${formatDuration(data.duration)}`}
        {typeof data.retryCount === 'number' && data.retryCount > 0 && ` • retry ${data.retryCount}`}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: statusColors[data.status] }} />
    </div>
  );
});

ActivityNode.displayName = 'ActivityNode';
