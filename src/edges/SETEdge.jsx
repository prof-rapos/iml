import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

function eventLabel(event) {
  if (!event) return '';
  if (event.kind === 'timeout') {
    return `${event.port}: timeout${event.msLabel ? ` (${event.msLabel}ms)` : ' (duration not statically known)'}`;
  }
  return `${event.port}.${event.signal}`;
}

function branchLabel(branch) {
  if (branch === 'all-guards-false') return 'else — dropped';
  if (branch?.startsWith('guard-')) return 'guard';
  return null;
}

export default function SETEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}) {
  const { edge } = data;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  const bLabel = branchLabel(edge.branch);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={'url(#arrow-open)'}
        style={{
          stroke: edge.guardFork ? '#d97706' : '#111827',
          strokeWidth: 2.25,
          strokeDasharray: edge.branch === 'all-guards-false' ? '5,4' : undefined,
        }}
        interactionWidth={14}
      />

      <EdgeLabelRenderer>
        <div
          title={edge.guardFork ? 'Best-effort — guard outcome not guaranteed' : undefined}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 11, fontWeight: 600,
            background: 'var(--iml-node-bg)',
            padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${edge.guardFork ? '#d97706' : 'var(--iml-border)'}`,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <span>{eventLabel(edge.event)}</span>
          {bLabel && <span style={{ opacity: 0.75, fontStyle: 'italic', fontSize: 10 }}>{bLabel}</span>}
          {edge.guardFork && <span aria-label="guard fork, best effort" style={{ color: '#d97706' }}>⚠</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
