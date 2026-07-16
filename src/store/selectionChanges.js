// Shared by every store's onNodesChange/onEdgesChange (modelStore,
// behaviourStore, capsuleStructureStore). From a batch of React Flow
// node/edge changes, derives the selection patch: prioritising a change with
// selected:true so switching selection doesn't flash null, falling back to
// any select change (a deselect) otherwise. Returns {} when there's nothing
// to change, so callers can spread/assign it unconditionally.
export function selectionPatch(changes, kind, current) {
  const sel = changes.find((c) => c.type === 'select' && c.selected)
    ?? changes.find((c) => c.type === 'select');
  if (!sel) return {};
  if (sel.selected) return { selectedId: sel.id, selectedType: kind };
  if (current.selectedType === kind && current.selectedId === sel.id) {
    return { selectedId: null, selectedType: null };
  }
  return {};
}
