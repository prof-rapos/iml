import { useCallback } from 'react';
import { ReactFlow, Background, Controls, ConnectionMode, ConnectionLineType, useOnViewportChange } from '@xyflow/react';
import { useCapsuleStructureStore } from '../../store/capsuleStructureStore';
import PartNode from '../../nodes/PartNode';
import ConnectorEdge from '../../edges/ConnectorEdge';
import SvgMarkers from '../SvgMarkers';
import { useDeleteKeyHandler } from '../../utils/useDeleteKeyHandler';

const nodeTypes = { partNode: PartNode };
const edgeTypes = { connectorEdge: ConnectorEdge };

export default function CapsuleStructureCanvas() {
  const nodes          = useCapsuleStructureStore((s) => s.nodes);
  const edges          = useCapsuleStructureStore((s) => s.edges);
  const onNodesChange  = useCapsuleStructureStore((s) => s.onNodesChange);
  const onEdgesChange  = useCapsuleStructureStore((s) => s.onEdgesChange);
  const addConnector   = useCapsuleStructureStore((s) => s.addConnector);
  const setSelected    = useCapsuleStructureStore((s) => s.setSelected);
  const deleteSelected = useCapsuleStructureStore((s) => s.deleteSelected);
  const setViewport    = useCapsuleStructureStore((s) => s.setViewport);
  const selectedId     = useCapsuleStructureStore((s) => s.selectedId);

  const onConnect = useCallback((params) => {
    addConnector(params.source, params.sourceHandle, params.target, params.targetHandle);
  }, [addConnector]);

  // Only used to pick a spawn position for new parts, so onEnd (not every
  // pan/zoom frame) is fresh enough and avoids extra re-renders mid-gesture.
  useOnViewportChange({
    onEnd: useCallback((vp) => setViewport(vp), [setViewport]),
  });

  useDeleteKeyHandler(selectedId, deleteSelected);

  return (
    <div style={{ flex: 1, position: 'relative', background: 'var(--iml-canvas-bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => setSelected(null, null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#a855f7', strokeWidth: 2, strokeDasharray: '6,3' }}
        deleteKeyCode={null}
        panActivationKeyCode={null}
        fitView
      >
        <SvgMarkers />
        <Background color="var(--iml-grid-color)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
