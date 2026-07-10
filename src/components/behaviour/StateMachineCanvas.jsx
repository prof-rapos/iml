import { useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, ConnectionMode, ConnectionLineType } from '@xyflow/react';
import { useBehaviourStore } from '../../store/behaviourStore';
import StateNode from '../../nodes/StateNode';
import InitialNode from '../../nodes/InitialNode';
import TransitionEdge from '../../edges/TransitionEdge';

const nodeTypes = { stateNode: StateNode, initialNode: InitialNode };
const edgeTypes = { transitionEdge: TransitionEdge };

export default function StateMachineCanvas() {
  const nodes         = useBehaviourStore((s) => s.nodes);
  const edges         = useBehaviourStore((s) => s.edges);
  const onNodesChange = useBehaviourStore((s) => s.onNodesChange);
  const onEdgesChange = useBehaviourStore((s) => s.onEdgesChange);
  const addTransition = useBehaviourStore((s) => s.addTransition);
  const setSelected   = useBehaviourStore((s) => s.setSelected);
  const deleteSelected = useBehaviourStore((s) => s.deleteSelected);
  const selectedId    = useBehaviourStore((s) => s.selectedId);

  const onConnect = useCallback((params) => {
    addTransition(params.source, params.target, params.sourceHandle, params.targetHandle);
  }, [addTransition]);

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
        onPaneClick={() => setSelected(null, null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#d97706', strokeWidth: 2, strokeDasharray: '6,3' }}
        deleteKeyCode={null}
        fitView
      >
        <Background color="var(--iml-grid-color)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
