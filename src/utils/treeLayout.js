// Hand-rolled subtree-width layout for a Symbolic Execution Tree. No graph
// auto-layout library exists in this project (only @xyflow/react itself) —
// every other ReactFlow canvas here renders user-authored, manually-dragged
// diagrams with persisted positions. A SET is programmatically generated, so
// it needs its own layout: leaves get sequential x "slots" left to right,
// each internal node centers over its children, y is purely a function of
// depth. The tree is a true tree (every node has exactly one parent edge, no
// shared references), so a single top-down recursion is safe.

// Wider than a typical node's own minWidth (150px, see SETNode.jsx) since a
// node can grow considerably past that — a leaf-subsumed node in particular
// adds a "→ StateName (attr=val, ...)" line that often makes it the widest
// card in the tree — and sibling edges each carry their own label (e.g.
// "timer: timeout (500ms)") that needs its own clearance too. This is a
// fixed-width heuristic, not true content-aware layout (this function has
// no access to actual rendered card widths — nodes aren't measured until
// after React Flow first paints them) — it reduces how often two siblings'
// cards/labels overlap for a typical tree, but doesn't guarantee it for an
// unusually wide node. SETViewerPanel's nodesDraggable is the fallback for
// whatever this heuristic doesn't cover.
const COL_WIDTH  = 300;
const ROW_HEIGHT = 180;

export function layoutTree(setResult) {
  const { nodesById, edgesById, rootId } = setResult;
  const positions = {};
  if (!rootId) return positions;

  const childrenOf = new Map();
  for (const edge of edgesById.values()) {
    if (!childrenOf.has(edge.sourceNodeId)) childrenOf.set(edge.sourceNodeId, []);
    childrenOf.get(edge.sourceNodeId).push(edge.targetNodeId);
  }

  let nextLeafSlot = 0;
  const slotOf = new Map();

  function assign(nodeId) {
    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) {
      const slot = nextLeafSlot++;
      slotOf.set(nodeId, slot);
      return slot;
    }
    const childSlots = children.map(assign);
    const slot = childSlots.reduce((a, b) => a + b, 0) / childSlots.length;
    slotOf.set(nodeId, slot);
    return slot;
  }

  assign(rootId);

  for (const [nodeId, slot] of slotOf) {
    const node = nodesById.get(nodeId);
    positions[nodeId] = { x: slot * COL_WIDTH, y: (node?.depth ?? 0) * ROW_HEIGHT };
  }

  return positions;
}
