import { Handle, Position } from '@xyflow/react';

// Every node type wires a Handle to all four sides with the same id/position
// pairing, differing only in `type` (source vs target) and marker style.
export function AllSidesHandles({ type = 'source', style }) {
  return (
    <>
      <Handle id="right"  type={type} position={Position.Right}  style={style} />
      <Handle id="left"   type={type} position={Position.Left}   style={style} />
      <Handle id="top"    type={type} position={Position.Top}    style={style} />
      <Handle id="bottom" type={type} position={Position.Bottom} style={style} />
    </>
  );
}

const EMPTY_STATE_STYLE = { padding: '4px 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' };

// The "no attributes" / "no literals" placeholder shown in a node's body
// list when it has nothing to display yet.
export function NodeEmptyState({ children }) {
  return <div style={EMPTY_STATE_STYLE}>{children}</div>;
}
