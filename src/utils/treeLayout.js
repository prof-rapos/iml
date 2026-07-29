// Hand-rolled subtree-width layout for a Symbolic Execution Tree. No graph
// auto-layout library exists in this project (only @xyflow/react itself) —
// every other ReactFlow canvas here renders user-authored, manually-dragged
// diagrams with persisted positions. A SET is programmatically generated, so
// it needs its own layout: leaves get sequential x "slots" left to right,
// each internal node centers over its children, y is purely a function of
// depth. The tree is a true tree (every node has exactly one parent edge, no
// shared references), so a single top-down recursion is safe.

const COL_WIDTH  = 220;
const ROW_HEIGHT = 160;

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
