import { useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, ConnectionMode, ConnectionLineType } from '@xyflow/react';
import { useBehaviourStore } from '../../store/behaviourStore';
import StateNode from '../../nodes/StateNode';
import InitialNode from '../../nodes/InitialNode';
import FinalNode from '../../nodes/FinalNode';
import TransitionEdge from '../../edges/TransitionEdge';
import SvgMarkers from '../SvgMarkers';

const nodeTypes = { stateNode: StateNode, initialNode: InitialNode, finalNode: FinalNode };
const edgeTypes = { transitionEdge: TransitionEdge };

export default function StateMachineCanvas() {
  const nodes          = useBehaviourStore((s) => s.nodes);
  const edges          = useBehaviourStore((s) => s.edges);
  const onNodesChange  = useBehaviourStore((s) => s.onNodesChange);
  const onEdgesChange  = useBehaviourStore((s) => s.onEdgesChange);
  const addTransition  = useBehaviourStore((s) => s.addTransition);
  const reconnectTransition = useBehaviourStore((s) => s.reconnectTransition);
  const setSelected    = useBehaviourStore((s) => s.setSelected);
  const deleteSelected = useBehaviourStore((s) => s.deleteSelected);
  const setViewport    = useBehaviourStore((s) => s.setViewport);
  const selectedId     = useBehaviourStore((s) => s.selectedId);

  const onConnect = useCallback((params) => {
    addTransition(params.source, params.target, params.sourceHandle, params.targetHandle);
  }, [addTransition]);

  const onReconnect = useCallback((oldEdge, conn) => {
    reconnectTransition(oldEdge, conn);
  }, [reconnectTransition]);

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
        onReconnect={onReconnect}
        onMove={(_, vp) => setViewport(vp)}
        onPaneClick={() => setSelected(null, null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#d97706', strokeWidth: 2, strokeDasharray: '6,3' }}
        deleteKeyCode={null}
        panActivationKeyCode={null}
        edgesReconnectable
        fitView
      >
        <SvgMarkers />
        <Background color="var(--iml-grid-color)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
