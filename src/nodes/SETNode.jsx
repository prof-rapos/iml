import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';
import { useMbtStore } from '../store/mbtStore';
import { getAllAttributes } from '../utils/modelHelpers';
import { stateName } from '../utils/mbtCodeGen';
import { STATUS_BORDER, STATUS_LABEL } from '../utils/setNodeStatus';

const PATH_HIGHLIGHT = '#f59e0b';

const handleStyle = {
  width: 8, height: 8,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
  // See nodeShell.jsx's NO_TRANSFORM comment — a custom-sized handle's
  // default centering transform disagrees with React Flow's own
  // edge-position math, leaving a gap between the node border and where
  // the edge actually connects.
  transform: 'none',
};

// "→ StateA (x=3, y=2)" instead of an opaque id fragment — names the actual
// state (and its known attribute values) a subsumed leaf loops back into,
// since a bare truncated node id told you nothing about what it referred to.
function subsumedIntoLabel(node, nodesById, machine, attrs) {
  if (!node.subsumedByNodeId) return null;
  const target = nodesById?.get(node.subsumedByNodeId);
  if (!target) return null;
  const known = attrs
    .map((a) => ({ name: a.name, v: target.attrValues.get(a.id) }))
    .filter((a) => a.v?.kind === 'known')
    .map((a) => `${a.name}=${a.v.value}`);
  const attrPart = known.length ? ` (${known.join(', ')})` : '';
  return `${stateName(target, machine)}${attrPart}`;
}

export default function SETNode({ data, selected }) {
  const { node } = data;
  const capsuleId = useMbtStore((s) => s.capsuleId);
  const selectedLeafId = useMbtStore((s) => s.selectedLeafId);
  const selectLeaf = useMbtStore((s) => s.selectLeaf);
  const pathNodeIds = useMbtStore((s) => s.pathNodeIds);
  const setResult = useMbtStore((s) => s.setResult);
  const metaModel = useModelStore((s) => s.metaModel);

  const machine = metaModel.behaviours?.[capsuleId];
  const attrs = capsuleId ? getAllAttributes(capsuleId, metaModel) : [];
  const isLeaf = node.status !== 'open';
  const isSelected = selectedLeafId === node.id;
  const onPath = pathNodeIds?.has(node.id) ?? false;
  const border = onPath ? PATH_HIGHLIGHT : (STATUS_BORDER[node.status] ?? STATUS_BORDER.open);

  return (
    <div
      onClick={() => isLeaf && selectLeaf(node.id)}
      style={{
        background: 'var(--iml-node-bg)',
        border: `${onPath ? 3 : 2}px ${node.status === 'leaf-subsumed' || node.status === 'leaf-depth-bound' ? 'dashed' : 'solid'} ${border}`,
        borderRadius: 10,
        minWidth: 150,
        fontFamily: 'var(--iml-font-sans)',
        boxShadow: isSelected ? '0 0 0 3px rgba(217,119,6,0.35)' : (selected ? '0 0 0 2px rgba(255,255,255,0.2)' : (onPath ? '0 0 10px rgba(245,158,11,0.45)' : '0 2px 6px rgba(0,0,0,0.25)')),
        cursor: isLeaf ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
      title={isLeaf ? 'Click to select this test case' : undefined}
    >
      <div style={{
        background: border, padding: '6px 12px', color: '#fff', fontWeight: 600, fontSize: 13, textAlign: 'center',
      }}>
        {stateName(node, machine)}
      </div>

      {isLeaf && (
        <div style={{ padding: '2px 12px', fontSize: 10, textAlign: 'center', color: border, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {STATUS_LABEL[node.status]}
          {node.status === 'leaf-subsumed' && (
            <div style={{ textTransform: 'none', fontWeight: 500, fontSize: 10, opacity: 0.85, marginTop: 1 }}>
              → {subsumedIntoLabel(node, setResult?.nodesById, machine, attrs) ?? 'unknown'}
            </div>
          )}
        </div>
      )}

      {attrs.length > 0 && (
        <div style={{ padding: '4px 12px 8px', fontSize: 11, color: '#cbd5e1', fontFamily: 'var(--iml-font-mono)', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {attrs.map((a) => {
            const v = node.attrValues.get(a.id);
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ opacity: 0.6 }}>{a.name}</span>
                <span style={{ opacity: v?.kind === 'known' ? 1 : 0.4, fontStyle: v?.kind === 'known' ? 'normal' : 'italic' }}>
                  {v?.kind === 'known' ? v.value : '?'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* A strictly top-down tree only ever needs one incoming (top) and one
          outgoing (bottom) handle — no need for AllSidesHandles' 4-way,
          all-source-typed set (that's for user-draggable diagrams). */}
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
    </div>
  );
}
