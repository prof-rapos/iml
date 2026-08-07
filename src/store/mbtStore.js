import { create } from 'zustand';
import { applyNodeChanges } from '@xyflow/react';
import { useModelStore } from './modelStore';
import { buildSET, pathToLeaf } from '../utils/symbolicExecution.js';
import { layoutTree } from '../utils/treeLayout.js';

// View-level state for Model-Based Testing, mirroring behaviourStore.js's
// pattern: a "current subject" (capsuleId), derived React Flow nodes/edges,
// a selection field. Unlike capsuleStructureStore.js's reactive
// useModelStore.subscribe(...) rebuild, buildSET is expensive enough
// (symbolic execution, not a cheap derivation) that it's only run as an
// EXPLICIT action — on capsule selection or a manual rebuild — not on every
// unrelated model edit. The module-scope subscription below is only a cheap
// staleness CHECK (does capsuleId still resolve?), not a rebuild trigger.
// Exported so the "Generate Report" pipeline can build SET nodes/edges for
// a headless capture (see ReportRenderHost.jsx) without driving this
// store's own UI-oriented capsuleId/rebuild() flow, which is async-
// scheduled for reasons (spinner, staleness checks) that don't apply to a
// one-shot batch render.
export function toFlowNodesEdges(setResult, positions) {
  const nodes = [...setResult.nodesById.values()].map((n) => ({
    id: n.id,
    type: 'setNode',
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: { node: n },
  }));
  const edges = [...setResult.edgesById.values()].map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    // treeLayout.js is always strictly top-down (child depth > parent depth),
    // so the edge anchor is always bottom-of-parent -> top-of-child.
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'setEdge',
    data: { edge: e },
  }));
  return { nodes, edges };
}

export function pathIdsFor(leafId, setResult) {
  if (!leafId || !setResult) return { pathNodeIds: null, pathEdgeIds: null };
  const path = pathToLeaf(leafId, setResult);
  if (!path) return { pathNodeIds: null, pathEdgeIds: null };
  const pathNodeIds = new Set([path.root.id]);
  const pathEdgeIds = new Set();
  for (const edge of path.edgeChain) {
    pathEdgeIds.add(edge.id);
    pathNodeIds.add(edge.targetNodeId);
  }
  return { pathNodeIds, pathEdgeIds };
}

export const useMbtStore = create((set, get) => ({
  capsuleId: null,
  setResult: null,
  nodes: [],
  edges: [],
  selectedLeafId: null,
  pathNodeIds: null,
  pathEdgeIds: null,
  building: false,
  // Bumped on every fresh build so the SET Viewer can re-center the
  // viewport exactly once per build, not on every unrelated re-render.
  buildToken: 0,

  setCapsule: (classId) => {
    if (!classId) {
      set({
        capsuleId: null, setResult: null, nodes: [], edges: [],
        selectedLeafId: null, pathNodeIds: null, pathEdgeIds: null, building: false,
      });
      return;
    }
    get()._build(classId);
  },

  // Re-runs the current capsule's build — the only way to refresh a tree
  // after editing that same capsule's state machine elsewhere, since
  // re-selecting an already-selected dropdown value doesn't fire onChange.
  rebuild: () => {
    const { capsuleId } = get();
    if (capsuleId) get()._build(capsuleId);
  },

  // Internal. Sets `building: true` and clears the old tree immediately (one
  // synchronous render), then defers the actual buildSET call to the next
  // tick — buildSET is synchronous and can take a real, visible moment for a
  // large tree, and without yielding first the browser never gets a chance
  // to paint the "Building…" state before the main thread blocks.
  _build: (classId) => {
    set({
      capsuleId: classId, setResult: null, nodes: [], edges: [],
      selectedLeafId: null, pathNodeIds: null, pathEdgeIds: null, building: true,
    });
    setTimeout(() => {
      // The capsule may have changed again while this was pending (rapid
      // reselection) — only apply the result if it's still current.
      if (get().capsuleId !== classId) return;
      const { metaModel } = useModelStore.getState();
      const setResult = buildSET(classId, metaModel);
      const positions = layoutTree(setResult);
      const { nodes, edges } = toFlowNodesEdges(setResult, positions);
      set((s) => ({ setResult, nodes, edges, building: false, buildToken: s.buildToken + 1 }));
    }, 0);
  },

  // Nodes are non-draggable/non-connectable, but React Flow still needs this
  // wired: it dispatches "dimensions" change events once each node has been
  // measured, and without applying them back the node stays permanently
  // visibility:hidden (React Flow's pre-measurement state) — which also
  // blocks every edge from rendering, since an edge's path depends on its
  // endpoints' measured dimensions.
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),

  // React Flow's own node `.selected` flag (a plain click, since nodes here
  // are selectable — see the comment above) is a separate concept from
  // selectedLeafId's amber path highlight — used by the diagram export's
  // "deselect everything first" step (see modelStore.js's deselectAll for
  // the fuller explanation of why clearing one doesn't clear the other).
  deselectAll: () => set((s) => ({
    nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
  })),

  selectLeaf: (leafId) => {
    const { setResult } = get();
    set({ selectedLeafId: leafId, ...pathIdsFor(leafId, setResult) });
  },
}));

// A cheap staleness check (not a rebuild): if the current capsule no longer
// resolves to a class+behaviour in the model (e.g. a different project was
// imported, or the class was deleted), clear the stale tree rather than
// leave it displayed against a model it no longer belongs to — which,
// besides being wrong, made every state look "(unnamed)" (the label lookup
// uses the CURRENT metaModel.behaviours[capsuleId], which no longer has a
// matching key). Cheap enough to run on every model change; does not
// rebuild a tree that's still valid just because something else changed.
useModelStore.subscribe((state, prevState) => {
  if (state.metaModel === prevState.metaModel) return;
  const { capsuleId, setCapsule } = useMbtStore.getState();
  if (!capsuleId) return;
  const cls = state.metaModel.classes.find((c) => c.id === capsuleId);
  const hasBehaviour = !!state.metaModel.behaviours?.[capsuleId]?.states?.length;
  if (!cls || !hasBehaviour) setCapsule(null);
});
