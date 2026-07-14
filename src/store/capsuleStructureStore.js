import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useModelStore, getProtocolById } from './modelStore';

// View-level state for the capsule structure (parts + connectors) editor. The
// persistent model (connectors) lives in modelStore's current instance model;
// this store holds selection and the React Flow graph, mirroring behaviourStore.js.
export const useCapsuleStructureStore = create((set, get) => ({
  selectedId:   null,
  selectedType: null,  // 'node' | 'edge'
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },

  setSelected: (id, type) => set({ selectedId: id, selectedType: type }),
  setViewport: (viewport) => set({ viewport }),

  rebuild: () => {
    const ms = useModelStore.getState();
    const im = ms.instanceModels[ms.currentIMIndex];
    if (!im) { set({ nodes: [], edges: [] }); return; }

    const parts = im.objects.filter((o) => {
      const cls = ms.metaModel.classes.find((c) => c.id === o.classId);
      return (cls?.ports ?? []).length > 0;
    });

    const csSaved = ms.layouts[`cs-${im.id}`] ?? {};
    const imSaved = ms.layouts[`im-${im.id}`] ?? {};
    const pos = (id, i) => csSaved[id] ?? imSaved[id] ?? { x: 80 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 220 };

    set({
      nodes: parts.map((obj, i) => ({
        id: obj.id,
        type: 'partNode',
        position: pos(obj.id, i),
        data: { objectId: obj.id },
      })),
      edges: (im.connectors ?? []).map((c) => {
        const srcObj = im.objects.find((o) => o.id === c.sourceObjectId);
        const srcCls = ms.metaModel.classes.find((cl) => cl.id === srcObj?.classId);
        const srcPort = (srcCls?.ports ?? []).find((p) => p.id === c.sourcePortId);
        const proto = srcPort ? getProtocolById(srcPort.protocolId, ms.metaModel) : null;
        return {
          id: c.id,
          source: c.sourceObjectId, target: c.targetObjectId,
          sourceHandle: c.sourcePortId, targetHandle: c.targetPortId,
          type: 'connectorEdge',
          data: { label: proto?.name ?? '' },
        };
      }),
    });
  },

  onNodesChange: (changes) => {
    set((s) => {
      const nodes = applyNodeChanges(changes, s.nodes);
      const patch = { nodes };

      const done = changes.filter((c) => c.type === 'position' && c.position && c.dragging === false);
      if (done.length) {
        const ms = useModelStore.getState();
        const im = ms.instanceModels[ms.currentIMIndex];
        if (im) {
          const posMap = {};
          for (const c of done) posMap[c.id] = c.position;
          ms.setPartPositions(im.id, posMap);
        }
      }

      const sel = changes.find((c) => c.type === 'select');
      if (sel) {
        if (sel.selected) { patch.selectedId = sel.id; patch.selectedType = 'node'; }
        else if (s.selectedType === 'node' && s.selectedId === sel.id) { patch.selectedId = null; patch.selectedType = null; }
      }
      return patch;
    });
  },

  onEdgesChange: (changes) => {
    set((s) => {
      const patch = { edges: applyEdgeChanges(changes, s.edges) };
      const sel = changes.find((c) => c.type === 'select');
      if (sel) {
        if (sel.selected) { patch.selectedId = sel.id; patch.selectedType = 'edge'; }
        else if (s.selectedType === 'edge' && s.selectedId === sel.id) { patch.selectedId = null; patch.selectedType = null; }
      }
      return patch;
    });
  },

  // ── Actions that delegate to modelStore then rebuild the graph ──────
  addConnector: (sourceObjectId, sourcePortId, targetObjectId, targetPortId) => {
    const id = useModelStore.getState().addConnector(sourceObjectId, sourcePortId, targetObjectId, targetPortId);
    get().rebuild();
    return id;
  },

  deleteSelected: () => {
    const { selectedId, selectedType } = get();
    if (!selectedId || selectedType !== 'edge') return;
    useModelStore.getState().deleteConnector(selectedId);
    set({ selectedId: null, selectedType: null });
    get().rebuild();
  },
}));
