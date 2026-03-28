import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import '@xyflow/react/dist/style.css';

import { ActivityNode } from './nodes/ActivityNode';
import { OrchestratorNode } from './nodes/OrchestratorNode';
import { TimerNode } from './nodes/TimerNode';
import { EventNode } from './nodes/EventNode';
import { StartEndNode } from './nodes/StartEndNode';
import { AnimatedEdge } from './edges/AnimatedEdge';
import { FlowControls } from './controls/FlowControls';
import { DetailsPanel } from './controls/DetailsPanel';
import { getLayoutedElements, type LayoutDirection } from './layoutEngine';
import type { FlowNodeData } from '../shared/messages';
import { statusColors } from '../shared/theme';
import { postMessage } from '../shared/vscodeApi';

const nodeTypes: NodeTypes = {
  activity: ActivityNode as unknown as NodeTypes['activity'],
  orchestrator: OrchestratorNode as unknown as NodeTypes['orchestrator'],
  subOrchestration: OrchestratorNode as unknown as NodeTypes['subOrchestration'],
  timer: TimerNode as unknown as NodeTypes['timer'],
  event: EventNode as unknown as NodeTypes['event'],
  start: StartEndNode as unknown as NodeTypes['start'],
  end: StartEndNode as unknown as NodeTypes['end'],
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge as unknown as EdgeTypes['animated'],
};

interface FlowCanvasProps {
  flowNodes: FlowNodeData[];
  flowEdges: { id: string; source: string; target: string; animated?: boolean; label?: string }[];
}

export function FlowCanvas({ flowNodes, flowEdges }: FlowCanvasProps) {
  const [direction, setDirection] = useState<LayoutDirection>('TB');
  const [selectedNode, setSelectedNode] = useState<FlowNodeData | null>(null);
  const [autoFit, setAutoFit] = useState(true);
  const { fitView, getNodes } = useReactFlow();

  // Convert FlowNodeData to React Flow nodes
  const initialNodes: Node[] = useMemo(
    () =>
      flowNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: 0, y: 0 },
        data: { ...n, onClick: (data: FlowNodeData) => setSelectedNode(data) },
      })),
    [flowNodes],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      flowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'animated',
        data: { animated: e.animated },
        label: e.label,
      })),
    [flowEdges],
  );

  // Apply layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges, direction),
    [initialNodes, initialEdges, direction],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    // Fit view after layout only when auto-fit is enabled
    if (autoFit) {
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    }
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, fitView, autoFit]);

  const handleDirectionChange = useCallback(
    (dir: LayoutDirection) => {
      setDirection(dir);
    },
    [],
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleToggleAutoFit = useCallback(() => {
    setAutoFit((prev) => {
      const next = !prev;
      if (next) {
        // When toggling ON, immediately fit view
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 0);
      }
      return next;
    });
  }, [fitView]);

  // Disable auto-fit when user manually pans/zooms
  const handleMoveStart = useCallback(
    (_event: unknown, _viewport: unknown) => {
      // onMoveStart fires for programmatic moves too; we only disable
      // auto-fit for user-initiated interactions (mouse / touch).
      // The event will be a MouseEvent or TouchEvent for user interactions,
      // and undefined / null for programmatic moves.
      if (_event) {
        setAutoFit(false);
      }
    },
    [],
  );

  const handleExport = useCallback(
    (format: 'png' | 'svg') => {
      const viewportEl = document.querySelector<HTMLElement>('.react-flow__viewport');
      if (!viewportEl) return;

      const currentNodes = getNodes();
      const bounds = getNodesBounds(currentNodes);
      const padding = 50;
      const width = bounds.width + padding * 2;
      const height = bounds.height + padding * 2;
      const viewport = getViewportForBounds(bounds, width, height, 0.5, 2, padding);

      const exportFn = format === 'png' ? toPng : toSvg;
      exportFn(viewportEl, {
        backgroundColor: '#1e1e1e',
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      }).then((dataUrl) => {
        const a = document.createElement('a');
        a.setAttribute('download', `durable-flow.${format}`);
        a.setAttribute('href', dataUrl);
        a.click();
      });
    },
    [getNodes],
  );

  const handleNavigateToCode = useCallback((functionName: string) => {
    postMessage({ type: 'navigateToCode', functionName });
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <FlowControls
        direction={direction}
        onDirectionChange={handleDirectionChange}
        onFitView={handleFitView}
        onExport={handleExport}
        autoFit={autoFit}
        onToggleAutoFit={handleToggleAutoFit}
      />
      <DetailsPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onNavigateToCode={handleNavigateToCode}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMoveStart={handleMoveStart}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            const status = (node.data as Record<string, unknown>)?.status as string | undefined;
            return (status && statusColors[status as keyof typeof statusColors]) || '#555';
          }}
          style={{
            background: 'var(--vscode-editorWidget-background, #1e1e1e)',
            border: '1px solid var(--vscode-editorWidget-border, #444)',
          }}
        />
      </ReactFlow>

      <style>{`
        @keyframes dashdraw {
          to { stroke-dashoffset: -10; }
        }
        .react-flow__node:hover {
          filter: brightness(1.15);
        }
      `}</style>
    </div>
  );
}
