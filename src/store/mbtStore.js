import { create } from 'zustand';
import { applyNodeChanges } from '@xyflow/react';
import { useModelStore } from './modelStore';
import { buildSET } from '../utils/symbolicExecution.js';
import { layoutTree } from '../utils/treeLayout.js';

// View-level state for Model-Based Testing, mirroring behaviourStore.js's
// pattern: a "current subject" (capsuleId), derived React Flow nodes/edges,
// a selection field. Unlike capsuleStructureStore.js's reactive
// useModelStore.subscribe(...) rebuild, buildSET is expensive enough
// (symbolic execution, not a cheap derivation) that it's only run as an
// EXPLICIT action — on capsule selection — not on every unrelated model edit.
function toFlowNodesEdges(setResult, positions) {
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

export const useMbtStore = create((set, get) => ({
  capsuleId: null,
  setResult: null,
  nodes: [],
  edges: [],
  selectedLeafId: null,

  setCapsule: (classId) => {
    if (!classId) {
      set({ capsuleId: null, setResult: null, nodes: [], edges: [], selectedLeafId: null });
      return;
    }
    const { metaModel } = useModelStore.getState();
    const setResult = buildSET(classId, metaModel);
    const positions = layoutTree(setResult);
    const { nodes, edges } = toFlowNodesEdges(setResult, positions);
    set({ capsuleId: classId, setResult, nodes, edges, selectedLeafId: null });
  },

  // Nodes are non-draggable/non-connectable, but React Flow still needs this
  // wired: it dispatches "dimensions" change events once each node has been
  // measured, and without applying them back the node stays permanently
  // visibility:hidden (React Flow's pre-measurement state) — which also
  // blocks every edge from rendering, since an edge's path depends on its
  // endpoints' measured dimensions.
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),

  selectLeaf: (leafId) => set({ selectedLeafId: leafId }),
}));
