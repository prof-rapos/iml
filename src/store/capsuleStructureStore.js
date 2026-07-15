import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useModelStore, getProtocolById, getPortByEndpoint } from './modelStore';

const wireablePorts = (obj, metaModel) => {
  const cls = metaModel.classes.find((c) => c.id === obj?.classId);
  return (cls?.ports ?? []).filter((p) => !getProtocolById(p.protocolId, metaModel)?.system);
};

// Assigns each object's wireable ports a vertical "row" slot, defaulting to
// its position in the class's port list, but swapping a connector's two
// endpoints onto the same row whenever they'd otherwise differ. That's what
// makes a reciprocal pair of connectors between the same two parts render as
// flat, parallel lines instead of crossing in an X. Pure + exported for unit
// testing; only fixes the common pairwise case — not a general crossing-free
// layout solver for parts wired to many others.
export function computePortRows(metaModel, im) {
  const rows  = {}; // { [objectId]: { [portId]: rowIndex } }
  const order = {}; // { [objectId]: [portId at row 0, row 1, ...] }

  for (const obj of im?.objects ?? []) {
    const ports = wireablePorts(obj, metaModel);
    if (ports.length === 0) continue;
    order[obj.id] = ports.map((p) => p.id);
    rows[obj.id]  = {};
    ports.forEach((p, i) => { rows[obj.id][p.id] = i; });
  }

  for (const c of im?.connectors ?? []) {
    const srcRows = rows[c.sourceObjectId];
    const tgtRows = rows[c.targetObjectId];
    if (!srcRows || !tgtRows) continue;
    const srcRow = srcRows[c.sourcePortId];
    const tgtRow = tgtRows[c.targetPortId];
    if (srcRow === undefined || tgtRow === undefined || srcRow === tgtRow) continue;

    // Move the target port onto the source's row, swapping with whichever
    // port currently occupies that row so every port keeps a unique slot.
    const tgtOrder = order[c.targetObjectId];
    const displacedPortId = tgtOrder[srcRow];
    tgtOrder[srcRow] = c.targetPortId;
    tgtOrder[tgtRow] = displacedPortId;
    tgtRows[c.targetPortId]  = srcRow;
    tgtRows[displacedPortId] = tgtRow;
  }

  return rows;
}

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

    const portRows = computePortRows(ms.metaModel, im);

    set({
      nodes: parts.map((obj, i) => ({
        id: obj.id,
        type: 'partNode',
        position: pos(obj.id, i),
        data: { objectId: obj.id, portRows: portRows[obj.id] ?? {} },
      })),
      edges: (im.connectors ?? []).map((c) => {
        const srcPort = getPortByEndpoint(ms.metaModel, im.objects, c.sourceObjectId, c.sourcePortId);
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

      // Prioritise selected:true so switching nodes doesn't flash null.
      const sel = changes.find((c) => c.type === 'select' && c.selected)
        ?? changes.find((c) => c.type === 'select');
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
      const sel = changes.find((c) => c.type === 'select' && c.selected)
        ?? changes.find((c) => c.type === 'select');
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
