import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import { useModelStore, getProtocolById, getPortByEndpoint } from './modelStore';
import { selectionPatch } from './selectionChanges';

const wireablePorts = (obj, metaModel) => {
  const cls = metaModel.classes.find((c) => c.id === obj?.classId);
  return (cls?.ports ?? []).filter((p) => !getProtocolById(p.protocolId, metaModel)?.system);
};

// Box geometry, shared with PartNode (which draws it) so a part's port rows
// and its box height can never disagree.
export const PART_HEADER_HEIGHT = 33;
export const PART_ROW_HEIGHT = 22;

// Assigns each part's wireable ports a vertical "row" slot — row 0..n-1, one
// per port, so a port can never land outside its box. Rows are ordered to keep
// wires from crossing: a part's connected ports are sorted by where their
// partner part sits vertically (the standard barycentre heuristic), so a wire
// to a part higher up leaves from a higher row. Ports wired to the same
// partner break ties by connector order, which is the same at both ends — so
// a reciprocal pair of connectors between two parts renders as flat, parallel
// lines instead of an X. Unconnected ports sit below the connected ones, in
// the class's own port order.
//
// `positions` ({ [objectId]: {x, y} }) is the parts' current canvas
// positions; without it every partner counts as the same height and only the
// connector-order rule applies. Pure + exported for unit testing; a
// heuristic, not a guaranteed crossing-free layout for densely wired parts.
export function computePortRows(metaModel, im, positions = {}) {
  const portsOf = {}; // { [objectId]: wireable ports in class order }
  for (const obj of im?.objects ?? []) {
    const ports = wireablePorts(obj, metaModel);
    if (ports.length > 0) portsOf[obj.id] = ports;
  }

  const centerY = (objectId) => {
    const p = positions[objectId];
    if (!p) return 0;
    const rowCount = Math.max(portsOf[objectId]?.length ?? 1, 1);
    return p.y + (PART_HEADER_HEIGHT + rowCount * PART_ROW_HEIGHT) / 2;
  };

  // { [objectId]: { [portId]: [{ partnerId, order }] } }, order = the
  // connector's index, identical from either end.
  const links = {};
  const addLink = (objectId, portId, partnerId, order) => {
    ((links[objectId] ??= {})[portId] ??= []).push({ partnerId, order });
  };
  (im?.connectors ?? []).forEach((c, order) => {
    addLink(c.sourceObjectId, c.sourcePortId, c.targetObjectId, order);
    addLink(c.targetObjectId, c.targetPortId, c.sourceObjectId, order);
  });

  const rows = {};
  for (const [objectId, ports] of Object.entries(portsOf)) {
    const keyed = ports.map((port, index) => {
      const ls = links[objectId]?.[port.id];
      if (!ls) return { port, index, connected: false };
      const y = ls.reduce((sum, l) => sum + centerY(l.partnerId), 0) / ls.length;
      return { port, index, connected: true, y, partnerId: ls[0].partnerId, order: Math.min(...ls.map((l) => l.order)) };
    });
    keyed.sort((x, y) => {
      if (x.connected !== y.connected) return x.connected ? -1 : 1;
      if (!x.connected) return x.index - y.index;
      return (x.y - y.y)
        || (x.partnerId < y.partnerId ? -1 : x.partnerId > y.partnerId ? 1 : 0)
        || (x.order - y.order)
        || (x.index - y.index);
    });
    rows[objectId] = Object.fromEntries(keyed.map((k, row) => [k.port.id, row]));
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

    const positions = Object.fromEntries(parts.map((obj, i) => [obj.id, pos(obj.id, i)]));
    const portRows = computePortRows(ms.metaModel, im, positions);

    set({
      nodes: parts.map((obj) => ({
        id: obj.id,
        type: 'partNode',
        position: positions[obj.id],
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

          // Parts moved, so which partner is above/below which may have
          // changed — re-order every part's port rows to match.
          const positions = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
          const rows = computePortRows(ms.metaModel, im, positions);
          patch.nodes = nodes.map((n) => ({ ...n, data: { ...n.data, portRows: rows[n.id] ?? {} } }));
        }
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

// Keep the derived graph in sync with the model on its own — mirrors
// modelStore's own live-conformance subscription — instead of depending on
// every future mount site remembering to call rebuild(). This is also what
// lets the Structure canvas show up-to-date parts/connectors the moment it
// mounts, even if the model changed while it was unmounted.
useModelStore.subscribe((state, prevState) => {
  if (
    state.metaModel      !== prevState.metaModel ||
    state.instanceModels !== prevState.instanceModels ||
    state.currentIMIndex !== prevState.currentIMIndex
  ) {
    useCapsuleStructureStore.getState().rebuild();
  }
});
