import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps & { data?: { animated?: boolean; color?: string } }) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const isAnimated = data?.animated !== false;
  const color = data?.color || 'var(--vscode-editorWidget-border, #555)';

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: color,
        strokeWidth: 2,
        ...style,
        ...(isAnimated
          ? { strokeDasharray: '5 5', animation: 'dashdraw 0.5s linear infinite' }
          : {}),
      }}
    />
  );
}
