import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

const ACCENT_NORMAL   = 'var(--iml-primary)'; // blue  — normal
const ACCENT_SELECTED = '#d97706';            // orange — selected

const handleStyle = {
  width: 9, height: 9,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function StateNode({ id, data, selected }) {
  const state = useModelStore((s) => s.metaModel.behaviours?.[data.capsuleId]?.states.find((st) => st.id === id));
  if (!state) return null;

  const accent = selected ? ACCENT_SELECTED : ACCENT_NORMAL;
  const hasActions = state.entry || state.exit;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${accent}`,
        borderRadius: 12,
        minWidth: 120,
        fontFamily: 'var(--iml-font-sans)',
        boxShadow: selected ? '0 0 0 3px rgba(217,119,6,0.25)' : '0 2px 6px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{
        background: accent,
        padding: hasActions ? '6px 12px' : '10px 14px',
        color: '#fff', fontWeight: 600, fontSize: 13, textAlign: 'center',
        whiteSpace: 'pre-wrap',
      }}>
        {state.name || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(unnamed)</span>}
      </div>

      {hasActions && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: '#cbd5e1', whiteSpace: 'pre-wrap', fontFamily: 'var(--iml-font-mono)' }}>
          {state.entry && <div>entry / {state.entry}</div>}
          {state.exit  && <div>exit / {state.exit}</div>}
        </div>
      )}

      <Handle id="right"  type="source" position={Position.Right}  style={{ ...handleStyle, right:  -5 }} />
      <Handle id="left"   type="source" position={Position.Left}   style={{ ...handleStyle, left:   -5 }} />
      <Handle id="top"    type="source" position={Position.Top}    style={{ ...handleStyle, top:    -5 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -5 }} />
    </div>
  );
}
