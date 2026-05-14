import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

export default function LinkEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected, markerEnd,
}) {
  const setSelectedId = useModelStore((s) => s.setSelectedId);
  const deleteLink    = useModelStore((s) => s.deleteLink);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 6,
  });

  return (
    <>
      {selected && (
        <path d={edgePath} fill="none"
          stroke="#ffffff" strokeWidth={8} strokeOpacity={0.6}
          style={{ pointerEvents: 'none' }} />
      )}

      <BaseEdge id={id} path={edgePath} markerEnd={'url(#arrow-open)'}
        style={{ stroke: '#000000', strokeWidth: selected ? 3.5 : 2.8 }}
        interactionWidth={14} />

      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={18}
        onClick={() => setSelectedId(id, 'edge')} style={{ cursor: 'pointer' }} />

      <EdgeLabelRenderer>
        {data?.label && (
          <div onClick={() => setSelectedId(id, 'edge')} style={{
            position: 'absolute',
            transform: `translate(-50%, -160%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12, fontStyle: 'italic', fontWeight: 700,
            background: 'rgba(255,255,255,0)',
            padding: '1px 6px', borderRadius: 3,
            color: '#fff', border: 'none',
            pointerEvents: 'all', cursor: 'pointer',
          }}>
            {data.label}
          </div>
        )}

      </EdgeLabelRenderer>
    </>
  );
}
