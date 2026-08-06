import { Handle, Position } from '@xyflow/react';

// React Flow's own .react-flow__handle-<side> CSS classes visually center a
// custom-sized handle via `<side>: 0` + a transform — but its *edge-position*
// math (getHandlePosition, used to compute where an edge actually connects)
// assumes the opposite: that the handle's un-transformed box already sits
// flush against the node border (x + width === border for a Right handle,
// etc.), with no transform involved. The two disagree the moment a handle
// isn't React Flow's own default size — which every handle in this app is,
// since every node type sets its own width/height — producing a gap between
// the node border and where edges visually connect. Canceling the transform
// makes the handle's un-shifted `<side>: 0` box (flush with the border) the
// one both systems agree on. Verified empirically: without this, a relation
// line stops ~10px short of the class node it's supposedly touching.
const NO_TRANSFORM = { transform: 'none' };

// Every node type wires a Handle to all four sides with the same id/position
// pairing, differing only in `type` (source vs target) and marker style.
export function AllSidesHandles({ type = 'source', style }) {
  const mergedStyle = { ...style, ...NO_TRANSFORM };
  return (
    <>
      <Handle id="right"  type={type} position={Position.Right}  style={mergedStyle} />
      <Handle id="left"   type={type} position={Position.Left}   style={mergedStyle} />
      <Handle id="top"    type={type} position={Position.Top}    style={mergedStyle} />
      <Handle id="bottom" type={type} position={Position.Bottom} style={mergedStyle} />
    </>
  );
}

const EMPTY_STATE_STYLE = { padding: '4px 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' };

// The "no attributes" / "no literals" placeholder shown in a node's body
// list when it has nothing to display yet.
export function NodeEmptyState({ children }) {
  return <div style={EMPTY_STATE_STYLE}>{children}</div>;
}
