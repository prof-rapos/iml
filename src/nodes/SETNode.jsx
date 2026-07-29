import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';
import { useMbtStore } from '../store/mbtStore';
import { getAllAttributes } from '../utils/modelHelpers';

const STATUS_BORDER = {
  open:              'var(--iml-primary)',
  'leaf-deadend':    '#64748b',
  'leaf-final':      '#dc2626',
  'leaf-subsumed':   '#7c3aed',
  'leaf-depth-bound': '#d97706',
};

const STATUS_LABEL = {
  'leaf-deadend': 'dead end',
  'leaf-final': 'final',
  'leaf-subsumed': 'subsumed',
  'leaf-depth-bound': 'depth limit',
};

const handleStyle = {
  width: 8, height: 8,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
};

function stateLabel(node, machine) {
  if (node.status === 'leaf-final') return 'Final';
  if (!node.stateId) return '(unresolved)';
  const state = machine?.states.find((s) => s.id === node.stateId);
  return state?.name || '(unnamed)';
}

// Shows a shortened form of a node id for the "subsumed → #X" backreference,
// since full nanoid ids are too long to display inline.
function shortRef(id) {
  return id ? id.slice(0, 4) : '?';
}

export default function SETNode({ data, selected }) {
  const { node } = data;
  const capsuleId = useMbtStore((s) => s.capsuleId);
  const selectedLeafId = useMbtStore((s) => s.selectedLeafId);
  const selectLeaf = useMbtStore((s) => s.selectLeaf);
  const metaModel = useModelStore((s) => s.metaModel);

  const machine = metaModel.behaviours?.[capsuleId];
  const attrs = capsuleId ? getAllAttributes(capsuleId, metaModel) : [];
  const isLeaf = node.status !== 'open';
  const isSelected = selectedLeafId === node.id;
  const border = STATUS_BORDER[node.status] ?? STATUS_BORDER.open;

  return (
    <div
      onClick={() => isLeaf && selectLeaf(node.id)}
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px ${node.status === 'leaf-subsumed' || node.status === 'leaf-depth-bound' ? 'dashed' : 'solid'} ${border}`,
        borderRadius: 10,
        minWidth: 150,
        fontFamily: 'var(--iml-font-sans)',
        boxShadow: isSelected ? '0 0 0 3px rgba(217,119,6,0.35)' : (selected ? '0 0 0 2px rgba(255,255,255,0.2)' : '0 2px 6px rgba(0,0,0,0.25)'),
        cursor: isLeaf ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
      title={isLeaf ? 'Click to select this test case' : undefined}
    >
      <div style={{
        background: border, padding: '6px 12px', color: '#fff', fontWeight: 600, fontSize: 13, textAlign: 'center',
      }}>
        {stateLabel(node, machine)}
      </div>

      {isLeaf && (
        <div style={{ padding: '2px 12px', fontSize: 10, textAlign: 'center', color: border, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {STATUS_LABEL[node.status]}
          {node.status === 'leaf-subsumed' && node.subsumedByNodeId && ` → #${shortRef(node.subsumedByNodeId)}`}
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
