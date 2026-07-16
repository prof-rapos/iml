import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useCapsuleStructureStore } from '../store/capsuleStructureStore';
import { EdgeClickCatcher } from './edgeShell';

// A connector joins one base port to one conjugate port of the same protocol
// (validated in modelStore.addConnector) — labeled with that shared protocol's name.
export default function ConnectorEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected,
}) {
  const setSelected = useCapsuleStructureStore((s) => s.setSelected);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none" stroke="#a855f7" strokeWidth={8} strokeOpacity={0.35} style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge id={id} path={edgePath}
        style={{ stroke: selected ? '#a855f7' : '#7c3aed', strokeWidth: selected ? 3.5 : 2.5 }} interactionWidth={14} />

      <EdgeClickCatcher id={id} edgePath={edgePath} onSelect={setSelected} />

      {data?.label && (
        <EdgeLabelRenderer>
          <div
            onClick={() => setSelected(id, 'edge')}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 11, fontWeight: 600, fontStyle: 'italic',
              background: 'var(--iml-node-bg)',
              padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${selected ? '#a855f7' : 'var(--iml-border)'}`,
              color: '#e2e8f0',
              pointerEvents: 'all', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            «{data.label}»
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
