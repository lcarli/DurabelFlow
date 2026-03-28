import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '../../shared/messages';
import { statusColors } from '../../shared/theme';

interface StartEndNodeData {
  label: string;
  status: NodeStatus;
  type: 'start' | 'end';
}

export const StartEndNode = memo(({ data }: { data: StartEndNodeData }) => {
  const isStart = data.type === 'start';
  const color = statusColors[data.status];

  return (
    <div
      style={{
        padding: '8px 20px',
        borderRadius: '20px',
        border: `2px solid ${color}`,
        backgroundColor: `${color}30`,
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        fontSize: '11px',
        fontWeight: 600,
        textAlign: 'center',
        minWidth: '80px',
      }}
    >
      {!isStart && (
        <Handle type="target" position={Position.Top} style={{ background: color }} />
      )}
      <span>{isStart ? '▶' : '⏹'} {data.label}</span>
      {isStart && (
        <Handle type="source" position={Position.Bottom} style={{ background: color }} />
      )}
    </div>
  );
});

StartEndNode.displayName = 'StartEndNode';
