import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';
import { EdgeClickCatcher } from './edgeShell';

const GLOW_COLORS = {
  INHERITANCE: 'var(--iml-inheritance)',
  REFERENCE:   'var(--iml-reference)',
  COMPOSITION: 'var(--iml-composition)',
};

// Offset multiplicity label away from the node border based on which handle side the edge leaves from
function multOffset(position) {
  switch (position) {
    case Position.Right:  return { dx:  14, dy: -18 };
    case Position.Left:   return { dx: -36, dy: -18 };
    case Position.Bottom: return { dx:   6, dy:  14 };
    case Position.Top:    return { dx:   6, dy: -22 };
    default:              return { dx:  14, dy: -18 };
  }
}

export default function RelationEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  selected,
}) {
  // Read directly from store — avoids the syncedEdges re-render → blur cycle
  const rel = useModelStore((s) => s.metaModel.relations.find((r) => r.id === id));
  const setSelectedId = useModelStore((s) => s.setSelectedId);

  const kind  = rel?.kind  ?? 'REFERENCE';
  const glowColor = GLOW_COLORS[kind] ?? '#cccccc';
  const color = '#000000';
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 6,
  });

  const strokeWidth = selected ? 3.5 : 2.8;

  const srcOff = multOffset(sourcePosition);
  const tgtOff = multOffset(targetPosition);

  return (
    <>
      {/* Selection glow */}
      {selected && (
        <path d={edgePath} fill="none"
          stroke={glowColor} strokeWidth={strokeWidth + 6} strokeOpacity={0.4}
          style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={kind === 'INHERITANCE' ? 'url(#arrow-inheritance)' : 'url(#arrow-open)'}
        markerStart={kind === 'COMPOSITION' ? 'url(#diamond-composition)' : undefined}
        style={{ stroke: color, strokeWidth }}
        interactionWidth={14}
      />

      <EdgeClickCatcher id={id} edgePath={edgePath} onSelect={setSelectedId} />

      <EdgeLabelRenderer>
        {/* Relation name — floats at midpoint */}
        {rel?.name && (
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -160%) translate(${labelX}px,${labelY}px)`,
            fontSize: 13, fontStyle: 'italic', fontWeight: 'bolder',
            background: 'rgba(255,255,255,0)',
            padding: '1px 6px', borderRadius: 3,
            color: `${glowColor}`,
            pointerEvents: 'none',
          }}>
            {rel.name}
          </div>
        )}

        {/* Source multiplicity — offset based on handle direction */}
        {rel?.sourceMultiplicity && (
          <div style={{
            position: 'absolute',
            transform: `translate(${sourceX + srcOff.dx}px,${sourceY + srcOff.dy}px)`,
            fontSize: 12, fontFamily: 'var(--iml-font-mono)',
            background: 'rgba(255,255,255,0)', borderRadius: 2, padding: '0 3px',
            color: '#fff', pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {rel.sourceMultiplicity}
          </div>
        )}

        {/* Target multiplicity */}
        {rel?.targetMultiplicity && (
          <div style={{
            position: 'absolute',
            transform: `translate(${targetX + tgtOff.dx}px,${targetY + tgtOff.dy}px)`,
            fontSize: 12, fontFamily: 'var(--iml-font-mono)',
            background: 'rgba(255,255,255,0)', borderRadius: 2, padding: '0 3px',
            color: '#fff', pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {rel.targetMultiplicity}
          </div>
        )}

      </EdgeLabelRenderer>
    </>
  );
}
