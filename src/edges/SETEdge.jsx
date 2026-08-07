import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useMbtStore } from '../store/mbtStore';

const PATH_HIGHLIGHT = '#f59e0b';

// paramLabel is only ever set on a signal event (see enumParamCombos in
// symbolicExecution.js) — a timeout has no enum-bounded parameter to fork
// on, so it's ignored there.
function eventLabel(event, paramLabel) {
  if (!event) return '';
  if (event.kind === 'timeout') {
    return `${event.port}: timeout${event.msLabel ? ` (${event.msLabel}ms)` : ' (duration not statically known)'}`;
  }
  const base = `${event.port}.${event.signal}`;
  return paramLabel ? `${base}(${paramLabel})` : base;
}

function branchLabel(branch) {
  if (branch === 'all-guards-false') return 'else — dropped';
  if (branch?.startsWith('guard-')) return 'guard';
  return null;
}

export default function SETEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}) {
  const { edge } = data;
  const pathEdgeIds = useMbtStore((s) => s.pathEdgeIds);
  const onPath = pathEdgeIds?.has(id) ?? false;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  const bLabel = branchLabel(edge.branch);
  const stroke = onPath ? PATH_HIGHLIGHT : (edge.guardFork ? '#d97706' : '#111827');

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={'url(#arrow-open)'}
        style={{
          stroke,
          strokeWidth: onPath ? 3.5 : 2.25,
          strokeDasharray: edge.branch === 'all-guards-false' ? '5,4' : undefined,
        }}
        interactionWidth={14}
      />

      <EdgeLabelRenderer>
        <div
          title={edge.guardFork ? (edge.guardReason ?? 'Best-effort — guard outcome not guaranteed') : undefined}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 11, fontWeight: 600,
            background: 'var(--iml-node-bg)',
            padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${onPath ? PATH_HIGHLIGHT : (edge.guardFork ? '#d97706' : 'var(--iml-border)')}`,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <span>{eventLabel(edge.event, edge.paramLabel)}</span>
          {bLabel && <span style={{ opacity: 0.75, fontStyle: 'italic', fontSize: 10 }}>{bLabel}</span>}
          {edge.guardFork && <span aria-label="guard fork, best effort" style={{ color: '#d97706' }}>⚠</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
