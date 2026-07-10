import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';
import { useBehaviourStore, transitionLabel } from '../store/behaviourStore';

export default function TransitionEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected,
}) {
  const t = useModelStore((s) => s.metaModel.behaviours?.[data.capsuleId]?.transitions.find((tr) => tr.id === id));
  const setSelected = useBehaviourStore((s) => s.setSelected);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  // Collapse newlines and truncate for the on-canvas label; the properties
  // panel shows the full multi-line text.
  const raw = t ? transitionLabel(t).replace(/\s*\n\s*/g, ' ') : '';
  const label = raw.length > 42 ? `${raw.slice(0, 42)}…` : raw;

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none" stroke="#d97706" strokeWidth={8} strokeOpacity={0.35} style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge id={id} path={edgePath} markerEnd={'url(#arrow-open)'}
        style={{ stroke: selected ? '#d97706' : '#111827', strokeWidth: selected ? 3.5 : 2.5 }} interactionWidth={14} />

      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        onClick={() => setSelected(id, 'edge')} style={{ cursor: 'pointer' }} />

      {label && (
        <EdgeLabelRenderer>
          <div
            onClick={() => setSelected(id, 'edge')}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 12, fontWeight: 600,
              background: 'var(--iml-node-bg)',
              padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${selected ? '#d97706' : 'var(--iml-border)'}`,
              color: '#e2e8f0',
              pointerEvents: 'all', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
