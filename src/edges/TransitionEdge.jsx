import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { Code2 } from 'lucide-react';
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

  // Head = trigger [guard] shown inline; the effect (code) is abbreviated to
  // its first line + a code icon when it spans multiple lines.
  const head = t ? `${t.trigger || ''}${t.guard ? ` [${t.guard}]` : ''}`.trim() : '';
  const effectLines = (t?.effect || '').split('\n').filter((l) => l.trim() !== '');
  const effectFirst = effectLines[0]
    ? (effectLines[0].length > 16 ? `${effectLines[0].slice(0, 16)}…` : effectLines[0])
    : '';
  const effectMulti = effectLines.length > 1;
  const showLabel = head || effectLines.length > 0;

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none" stroke="#d97706" strokeWidth={8} strokeOpacity={0.35} style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge id={id} path={edgePath} markerEnd={'url(#arrow-open)'}
        style={{ stroke: selected ? '#d97706' : '#111827', strokeWidth: selected ? 3.5 : 2.5 }} interactionWidth={14} />

      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        onClick={() => setSelected(id, 'edge')} style={{ cursor: 'pointer' }} />

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            onClick={() => setSelected(id, 'edge')}
            title={t ? transitionLabel(t) : ''}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 12, fontWeight: 600,
              background: 'var(--iml-node-bg)',
              padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${selected ? '#d97706' : 'var(--iml-border)'}`,
              color: '#e2e8f0',
              pointerEvents: 'all', cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {head && <span>{head}</span>}
            {effectLines.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0.85, fontFamily: 'var(--iml-font-mono)', fontSize: 11 }}>
                / {effectFirst}
                {effectMulti && <Code2 size={11} />}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
