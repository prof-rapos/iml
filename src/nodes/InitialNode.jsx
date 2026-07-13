import { Handle, Position } from '@xyflow/react';

// The initial pseudostate — a small filled circle with a single outgoing transition.
const handleStyle = {
  width: 8, height: 8,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function InitialNode({ selected }) {
  const fill = selected ? '#d97706' : '#e2e8f0';
  return (
    <div
      style={{
        width: 22, height: 22, borderRadius: '50%',
        background: fill,                          // solid filled disc
        border: `2px solid ${selected ? '#d97706' : '#94a3b8'}`,
        boxShadow: selected ? '0 0 0 3px rgba(217,119,6,0.25)' : '0 2px 6px rgba(0,0,0,0.3)',
        cursor: 'pointer',
      }}
    >
      <Handle id="right"  type="source" position={Position.Right}  style={handleStyle} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="left"   type="source" position={Position.Left}   style={handleStyle} />
      <Handle id="top"    type="source" position={Position.Top}    style={handleStyle} />
    </div>
  );
}
