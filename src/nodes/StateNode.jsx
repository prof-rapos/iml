import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

const handleStyle = {
  width: 9, height: 9,
  background: '#d97706',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function StateNode({ id, data, selected }) {
  const state = useModelStore((s) => s.metaModel.behaviours?.[data.capsuleId]?.states.find((st) => st.id === id));
  if (!state) return null;

  const hasActions = state.entry || state.exit;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${selected ? 'var(--iml-primary)' : '#d97706'}`,
        borderRadius: 12,
        minWidth: 120,
        fontFamily: 'var(--iml-font-sans)',
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 2px 6px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: hasActions ? '6px 12px' : '10px 14px',
        color: '#fff', fontWeight: 600, fontSize: 13, textAlign: 'center',
      }}>
        {state.name || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>(unnamed)</span>}
      </div>

      {hasActions && (
        <div style={{ borderTop: '1px solid var(--iml-border)', padding: '4px 12px', fontSize: 11, color: '#fcd9a8' }}>
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
