import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useModelStore } from './modelStore';
import { selectionPatch } from './selectionChanges';

// Builds the transition label: trigger [guard] / effect (any part optional).
export function transitionLabel(t) {
  let s = t.trigger || '';
  if (t.guard)  s += ` [${t.guard}]`;
  if (t.effect) s += ` / ${t.effect}`;
  return s.trim();
}

// View-level state for the behavioural (state-machine) editor. The persistent
// model (states/transitions) lives in modelStore.metaModel.behaviours; this
// store holds the currently-edited capsule, selection, and the React Flow graph.
const NODE_TYPE = { initial: 'initialNode', final: 'finalNode' };

export const useBehaviourStore = create((set, get) => ({
  capsuleId:   null,   // class id whose state machine is being edited
  selectedId:  null,
  selectedType: null,  // 'node' | 'edge'
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },  // kept current so new states spawn in view
  codeDrawer: null,                   // { scope:'state'|'transition', id, field, title } or null

  // Which sub-editor of the Behavioural module is showing: the per-capsule
  // state machine, or the capsule structure (parts + connectors) diagram.
  subView: 'statemachine',
  setSubView: (v) => set({ subView: v }),

  setCapsule: (classId) => {
    set({ capsuleId: classId, selectedId: null, selectedType: null, codeDrawer: null });
    get().rebuild();
  },

  setSelected: (id, type) => set({ selectedId: id, selectedType: type }),
  setViewport: (viewport) => set({ viewport }),
  openCodeDrawer: (target) => set({ codeDrawer: target }),
  closeCodeDrawer: () => set({ codeDrawer: null }),

  rebuild: () => {
    const { capsuleId } = get();
    const sm = useModelStore.getState().getBehaviour(capsuleId);
    if (!capsuleId || !sm) { set({ nodes: [], edges: [] }); return; }

    const saved = useModelStore.getState().layouts[`sm-${capsuleId}`] ?? {};
    const pos = (id, i) => saved[id] ?? { x: 120 + (i % 4) * 200, y: 100 + Math.floor(i / 4) * 150 };

    set({
      nodes: sm.states.map((st, i) => ({
        id: st.id,
        type: NODE_TYPE[st.kind] ?? 'stateNode',
        position: pos(st.id, i),
        data: { capsuleId },
      })),
      edges: sm.transitions.map((t) => ({
        id: t.id,
        source: t.source, target: t.target,
        sourceHandle: t.sourceHandle ?? null,
        targetHandle: t.targetHandle ?? null,
        type: 'transitionEdge',
        data: { capsuleId },
        markerEnd: { type: 'arrowclosed', width: 16, height: 16 },
      })),
    });
  },

  onNodesChange: (changes) => {
    set((s) => {
      const nodes = applyNodeChanges(changes, s.nodes);
      const patch = { nodes };

      // Persist positions only when a drag finishes (avoid a write per frame).
      const done = changes.filter((c) => c.type === 'position' && c.position && c.dragging === false);
      if (done.length) {
        const posMap = {};
        for (const c of done) posMap[c.id] = c.position;
        useModelStore.getState().setStatePositions(s.capsuleId, posMap);
      }

      Object.assign(patch, selectionPatch(changes, 'node', s));
      return patch;
    });
  },

  onEdgesChange: (changes) => {
    set((s) => {
      const patch = { edges: applyEdgeChanges(changes, s.edges) };
      Object.assign(patch, selectionPatch(changes, 'edge', s));
      return patch;
    });
  },

  // See modelStore.js's deselectAll for why this is a separate concept from
  // selectedId/selectedType — used by the diagram export's "deselect
  // everything first" step.
  deselectAll: () => set((s) => ({
    nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    selectedId: null, selectedType: null,
  })),

  // ── Actions that delegate to modelStore then rebuild the graph ──────
  addState: (kind, position) => {
    const { capsuleId } = get();
    const ms = useModelStore.getState();
    const id = ms.addState(capsuleId, kind);
    if (id && position) ms.setStatePositions(capsuleId, { [id]: position });
    get().rebuild();
    return id;
  },

  addTransition: (source, target, sourceHandle, targetHandle) => {
    const { capsuleId } = get();
    const id = useModelStore.getState().addTransition(capsuleId, source, target, sourceHandle, targetHandle);
    get().rebuild();
    return id;
  },

  // Move an existing transition's endpoint (to a different state or handle).
  reconnectTransition: (oldEdge, conn) => {
    const { capsuleId } = get();
    useModelStore.getState().updateTransition(capsuleId, oldEdge.id, {
      source: conn.source, target: conn.target,
      sourceHandle: conn.sourceHandle, targetHandle: conn.targetHandle,
    });
    get().rebuild();
  },

  deleteSelected: () => {
    const { capsuleId, selectedId, selectedType } = get();
    if (!selectedId) return;
    const ms = useModelStore.getState();
    if (selectedType === 'node') ms.deleteState(capsuleId, selectedId);
    else ms.deleteTransition(capsuleId, selectedId);
    set({ selectedId: null, selectedType: null });
    get().rebuild();
  },
}));
