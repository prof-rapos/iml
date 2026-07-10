import { Handle, Position } from '@xyflow/react';

// The initial pseudostate — a small filled circle with a single outgoing transition.
const handleStyle = {
  width: 8, height: 8,
  background: '#d97706',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function InitialNode({ selected }) {
  return (
    <div
      style={{
        width: 24, height: 24, borderRadius: '50%',
        background: '#0f172a',
        border: `3px solid ${selected ? 'var(--iml-primary)' : '#e2e8f0'}`,
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.25)' : '0 2px 6px rgba(0,0,0,0.3)',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: '#e2e8f0' }} />
      <Handle id="right"  type="source" position={Position.Right}  style={{ ...handleStyle, right:  -5 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -5 }} />
      <Handle id="left"   type="source" position={Position.Left}   style={{ ...handleStyle, left:   -5 }} />
      <Handle id="top"    type="source" position={Position.Top}    style={{ ...handleStyle, top:    -5 }} />
    </div>
  );
}
