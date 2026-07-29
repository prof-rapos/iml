import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import { useModelStore } from '../../store/modelStore';
import { useMbtStore } from '../../store/mbtStore';
import { hasStateMachine } from '../../utils/javaCodeGen';
import SETNode from '../../nodes/SETNode';
import SETEdge from '../../edges/SETEdge';
import SvgMarkers from '../SvgMarkers';
import { TEXT_DIM } from '../theme';

const nodeTypes = { setNode: SETNode };
const edgeTypes = { setEdge: SETEdge };
const BORDER = 'rgba(255,255,255,0.10)';

export default function SETViewerPanel() {
  const classes    = useModelStore((s) => s.metaModel.classes);
  const metaModel  = useModelStore((s) => s.metaModel);
  const capsuleId     = useMbtStore((s) => s.capsuleId);
  const setCapsule    = useMbtStore((s) => s.setCapsule);
  const nodes         = useMbtStore((s) => s.nodes);
  const edges         = useMbtStore((s) => s.edges);
  const onNodesChange = useMbtStore((s) => s.onNodesChange);

  const capsuleClasses = classes.filter((c) => hasStateMachine(c, metaModel));

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${BORDER}`, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: TEXT_DIM }}>Capsule</span>
        <select
          value={capsuleId ?? ''}
          onChange={(e) => setCapsule(e.target.value || null)}
          style={{
            background: '#21262d', border: `1px solid ${BORDER}`, color: '#e6edf3',
            borderRadius: 5, padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 160,
          }}
        >
          <option value="">— select a class —</option>
          {capsuleClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, position: 'relative', background: 'var(--iml-canvas-bg)' }}>
        {capsuleId ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              fitView
            >
              <SvgMarkers />
              <Background color="var(--iml-grid-color)" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', textAlign: 'center', padding: 24,
            color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)',
          }}>
            Select a <strong>capsule</strong> (class) above to build its symbolic execution tree.
          </div>
        )}
      </div>
    </div>
  );
}
