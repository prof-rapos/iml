import { useLayoutEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow } from '@xyflow/react';
import { Code2 } from 'lucide-react';
import { useModelStore } from '../store/modelStore';
import { useBehaviourStore, transitionLabel } from '../store/behaviourStore';
import { EdgeClickCatcher } from './edgeShell';

// A busy state machine can pack several transitions close together, and the
// label always sat at the fixed geometric midpoint with an opaque
// background and zero awareness of anything else on the canvas — labels
// routinely ended up stacked on each other or sitting on top of an
// unrelated node. Rather than a general collision-avoidance layout (a much
// bigger, riskier thing to get right for a cosmetic problem), the label can
// be dragged along its own line — `labelT` (0-1, default the midpoint) is
// the only new persisted field, purely a view concern like sourceHandle/
// targetHandle already are, so it doesn't touch codegen at all.
const SAMPLE_COUNT = 60;

// Closest point on an SVGPathElement to `point`, as a {t, x, y} — found by
// sampling rather than a closed-form projection, since a smoothstep path's
// shape (orthogonal segments + rounded corners) doesn't have one. Cheap
// enough per drag-frame for these short, few-segment transition paths.
function closestPointOnPath(pathEl, point) {
  const total = pathEl.getTotalLength();
  if (total === 0) return { t: 0.5, x: point.x, y: point.y };
  let bestT = 0.5, bestDist = Infinity, bestPoint = null;
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const p = pathEl.getPointAtLength(t * total);
    const dist = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (dist < bestDist) { bestDist = dist; bestT = t; bestPoint = p; }
  }
  return { t: bestT, x: bestPoint.x, y: bestPoint.y };
}

export default function TransitionEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected,
}) {
  const t = useModelStore((s) => s.metaModel.behaviours?.[data.capsuleId]?.transitions.find((tr) => tr.id === id));
  const updateTransition = useModelStore((s) => s.updateTransition);
  const setSelected = useBehaviourStore((s) => s.setSelected);
  const { screenToFlowPosition } = useReactFlow();

  const [edgePath, midX, midY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  const labelT = t?.labelT ?? 0.5;
  const pathRef = useRef(null);
  const [labelPos, setLabelPos] = useState({ x: midX, y: midY });
  const [dragging, setDragging] = useState(false);

  // Re-measure whenever the path's own geometry or the stored position
  // changes — a synchronous (pre-paint) layout effect so the label never
  // flashes at the wrong spot for a frame.
  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const total = el.getTotalLength();
    if (total === 0) { setLabelPos({ x: midX, y: midY }); return; }
    const p = el.getPointAtLength(labelT * total);
    setLabelPos({ x: p.x, y: p.y });
  }, [edgePath, labelT, midX, midY]);

  const handleLabelMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    let moved = false;
    const onMove = (moveEvt) => {
      moved = true;
      setDragging(true);
      if (!pathRef.current) return;
      const flowPt = screenToFlowPosition({ x: moveEvt.clientX, y: moveEvt.clientY });
      const { t: nt } = closestPointOnPath(pathRef.current, flowPt);
      updateTransition(data.capsuleId, id, { labelT: nt });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      if (!moved) setSelected(id, 'edge'); // a plain click (no drag) still selects, as before
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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

      <EdgeClickCatcher id={id} edgePath={edgePath} onSelect={setSelected} />

      {/* Invisible but present-in-DOM measurement path — kept in sync with
          the visible one so getPointAtLength reflects the real geometry. */}
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" style={{ pointerEvents: 'none' }} />

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            onMouseDown={handleLabelMouseDown}
            title={t ? `${transitionLabel(t)} — drag to reposition along the line` : ''}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
              fontSize: 12, fontWeight: 600,
              background: 'var(--iml-node-bg)',
              padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${selected ? '#d97706' : 'var(--iml-border)'}`,
              color: '#e2e8f0',
              pointerEvents: 'all', cursor: dragging ? 'grabbing' : 'grab', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              boxShadow: dragging ? '0 0 0 2px rgba(217,119,6,0.5)' : 'none',
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
