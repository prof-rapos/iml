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

  const label = t ? transitionLabel(t) : '';

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none" stroke="#ffffff" strokeWidth={8} strokeOpacity={0.6} style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge id={id} path={edgePath} markerEnd={'url(#arrow-open)'}
        style={{ stroke: '#111827', strokeWidth: selected ? 3.5 : 2.5 }} interactionWidth={14} />

      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        onClick={() => setSelected(id, 'edge')} style={{ cursor: 'pointer' }} />

      <EdgeLabelRenderer>
        <div
          onClick={() => setSelected(id, 'edge')}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 12, fontWeight: 600,
            background: 'var(--iml-node-bg)',
            padding: '2px 7px', borderRadius: 4,
            border: '1px solid #d97706',
            color: label ? '#fcd9a8' : 'rgba(255,255,255,0.35)',
            fontStyle: label ? 'normal' : 'italic',
            pointerEvents: 'all', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {label || 'transition'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
