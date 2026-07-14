import { useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, ConnectionMode, ConnectionLineType } from '@xyflow/react';
import { useCapsuleStructureStore } from '../../store/capsuleStructureStore';
import PartNode from '../../nodes/PartNode';
import ConnectorEdge from '../../edges/ConnectorEdge';
import SvgMarkers from '../SvgMarkers';

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

  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) deleteSelected();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, deleteSelected]);

  return (
    <div style={{ flex: 1, position: 'relative', background: 'var(--iml-canvas-bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMove={(_, vp) => setViewport(vp)}
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
