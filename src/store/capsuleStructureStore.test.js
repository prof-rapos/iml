import { describe, it, expect } from 'vitest';
import { computePortRows, useCapsuleStructureStore, PART_HEADER_HEIGHT, PART_ROW_HEIGHT } from './capsuleStructureStore.js';
import { useModelStore } from './modelStore.js';

// Mirrors the Lights model: two instances of a symmetric peer class (a base
// and a conjugate port of the same protocol), wired reciprocally.
function metaModel() {
  return {
    kind: 'metamodel', name: 'M',
    classes: [
      { id: 'C', name: 'C', attributes: [], ports: [
        { id: 'in',  name: 'in',  protocolId: 'p', conjugated: false },
        { id: 'out', name: 'out', protocolId: 'p', conjugated: true },
        { id: 'log', name: 'log', protocolId: 'sys-log', conjugated: false },
      ] },
    ],
    relations: [], enumerations: [], behaviours: {},
    protocols: [{ id: 'p', name: 'P', signals: [] }],
  };
}

function im(connectors) {
  return {
    id: 'IM', kind: 'instancemodel', name: 'IM',
    objects: [
      { id: 'a', classId: 'C', name: 'A', attributeValues: {} },
      { id: 'b', classId: 'C', name: 'B', attributeValues: {} },
    ],
    links: [], connectors,
  };
}

describe('computePortRows', () => {
  it('defaults each object to its wireable ports\' natural order when there are no connectors', () => {
    const rows = computePortRows(metaModel(), im([]));
    expect(rows.a).toEqual({ in: 0, out: 1 });
    expect(rows.b).toEqual({ in: 0, out: 1 });
  });

  it('excludes system-protocol ports (log) from row assignment entirely', () => {
    const rows = computePortRows(metaModel(), im([]));
    expect(rows.a.log).toBeUndefined();
  });

  it('aligns a reciprocal pair of connectors onto matching rows so the wires would run flat, not cross', () => {
    const connectors = [
      { id: 'c1', sourceObjectId: 'a', sourcePortId: 'out', targetObjectId: 'b', targetPortId: 'in' },
      { id: 'c2', sourceObjectId: 'a', sourcePortId: 'in',  targetObjectId: 'b', targetPortId: 'out' },
    ];
    const rows = computePortRows(metaModel(), im(connectors));

    // Both endpoints of each connector must land on the same row.
    expect(rows.a.out).toBe(rows.b.in);
    expect(rows.a.in).toBe(rows.b.out);
    // And the two connectors must not share a row (or they'd overlap instead).
    expect(rows.a.out).not.toBe(rows.a.in);
  });

  it('leaves a single connector\'s rows untouched when they already match', () => {
    const connectors = [
      { id: 'c1', sourceObjectId: 'a', sourcePortId: 'in', targetObjectId: 'b', targetPortId: 'in' },
    ];
    const rows = computePortRows(metaModel(), im(connectors));
    expect(rows.a).toEqual({ in: 0, out: 1 });
    expect(rows.b).toEqual({ in: 0, out: 1 });
  });

  it('is a no-op for objects with no wireable ports', () => {
    const mm = metaModel();
    mm.classes.push({ id: 'D', name: 'D', attributes: [], ports: [] });
    const instance = im([]);
    instance.objects.push({ id: 'd', classId: 'D', name: 'D1', attributeValues: {} });
    const rows = computePortRows(mm, instance);
    expect(rows.d).toBeUndefined();
  });
});

describe('useCapsuleStructureStore selection', () => {
  it('onNodesChange prioritises a selected:true change over a same-batch deselect, so clicking a different part switches selection instead of flashing null', () => {
    useCapsuleStructureStore.setState({ nodes: [], edges: [], selectedId: 'a', selectedType: 'node' });

    // React Flow can report a's deselect before b's select in the same batch.
    useCapsuleStructureStore.getState().onNodesChange([
      { type: 'select', id: 'a', selected: false },
      { type: 'select', id: 'b', selected: true },
    ]);

    const s = useCapsuleStructureStore.getState();
    expect(s.selectedId).toBe('b');
    expect(s.selectedType).toBe('node');
  });
});

// A small hub-and-spoke model: Hub has three ports, each wired to its own
// peer (Peer has a single conjugated port, Two has two).
function hubModel() {
  return {
    kind: 'metamodel', name: 'Hub',
    classes: [
      { id: 'Hub',  name: 'Hub',  attributes: [], ports: [
        { id: 'h1', name: 'h1', protocolId: 'p', conjugated: false },
        { id: 'h2', name: 'h2', protocolId: 'p', conjugated: false },
        { id: 'h3', name: 'h3', protocolId: 'p', conjugated: false },
      ] },
      { id: 'Peer', name: 'Peer', attributes: [], ports: [{ id: 'q', name: 'q', protocolId: 'p', conjugated: true }] },
      { id: 'Two',  name: 'Two',  attributes: [], ports: [
        { id: 't1', name: 't1', protocolId: 'p', conjugated: true },
        { id: 't2', name: 't2', protocolId: 'p', conjugated: true },
      ] },
    ],
    relations: [], enumerations: [], behaviours: {},
    protocols: [{ id: 'p', name: 'P', signals: [] }],
  };
}
const hubIm = (connectors) => ({
  id: 'IM', kind: 'instancemodel', name: 'IM', links: [], connectors,
  objects: [
    { id: 'hub', classId: 'Hub', name: 'Hub1', attributeValues: {} },
    { id: 'top', classId: 'Peer', name: 'Top', attributeValues: {} },
    { id: 'bottom', classId: 'Peer', name: 'Bottom', attributeValues: {} },
    { id: 'two', classId: 'Two', name: 'Two1', attributeValues: {} },
  ],
});

describe('computePortRows — crossing-aware ordering', () => {
  const positions = {
    hub: { x: 300, y: 200 }, top: { x: 0, y: 0 }, bottom: { x: 0, y: 600 }, two: { x: 600, y: 300 },
  };

  it("orders a part's ports by how high their partner sits, so wires to higher parts leave from higher rows", () => {
    // h1 is wired to the LOW part and h3 to the HIGH part — the class's own
    // order (h1, h2, h3) would cross them.
    const connectors = [
      { id: 'c1', sourceObjectId: 'hub', sourcePortId: 'h1', targetObjectId: 'bottom', targetPortId: 'q' },
      { id: 'c2', sourceObjectId: 'hub', sourcePortId: 'h2', targetObjectId: 'two',    targetPortId: 't1' },
      { id: 'c3', sourceObjectId: 'hub', sourcePortId: 'h3', targetObjectId: 'top',    targetPortId: 'q' },
    ];
    const rows = computePortRows(hubModel(), hubIm(connectors), positions);
    expect(rows.hub.h3).toBeLessThan(rows.hub.h2);   // top part first
    expect(rows.hub.h2).toBeLessThan(rows.hub.h1);   // bottom part last
  });

  it("never assigns a row outside the part's box, even when a partner has more ports", () => {
    // hub.h3 (class row 2) wired to a part that only has 1-2 rows.
    const connectors = [
      { id: 'c1', sourceObjectId: 'hub', sourcePortId: 'h3', targetObjectId: 'top', targetPortId: 'q' },
      { id: 'c2', sourceObjectId: 'hub', sourcePortId: 'h2', targetObjectId: 'two', targetPortId: 't2' },
    ];
    const rows = computePortRows(hubModel(), hubIm(connectors), positions);
    expect(Object.values(rows.top)).toEqual([0]);
    for (const [obj, portRows] of Object.entries(rows)) {
      const n = Object.keys(portRows).length;
      expect(Object.values(portRows).sort(), obj).toEqual([...Array(n).keys()]);   // exactly 0..n-1, no gaps or repeats
    }
  });

  it('puts unconnected ports below the connected ones', () => {
    const connectors = [{ id: 'c1', sourceObjectId: 'hub', sourcePortId: 'h3', targetObjectId: 'top', targetPortId: 'q' }];
    const rows = computePortRows(hubModel(), hubIm(connectors), positions);
    expect(rows.hub.h3).toBe(0);
    expect(rows.hub.h1).toBeLessThan(rows.hub.h2);   // the rest keep class order
    expect(rows.hub.h1).toBeGreaterThan(rows.hub.h3);
  });

  it('keeps two connectors between the same two parts on matching rows at both ends', () => {
    const connectors = [
      { id: 'c1', sourceObjectId: 'hub', sourcePortId: 'h2', targetObjectId: 'two', targetPortId: 't2' },
      { id: 'c2', sourceObjectId: 'hub', sourcePortId: 'h1', targetObjectId: 'two', targetPortId: 't1' },
    ];
    const rows = computePortRows(hubModel(), hubIm(connectors), positions);
    expect(rows.hub.h2).toBeLessThan(rows.hub.h1);   // c1 comes first at both ends
    expect(rows.two.t2).toBeLessThan(rows.two.t1);
  });

  it('exports the geometry PartNode draws with', () => {
    expect(PART_HEADER_HEIGHT).toBe(33);
    expect(PART_ROW_HEIGHT).toBe(22);
  });
});

describe('loading a model restores its composite-structure positions', () => {
  it("builds the structure nodes from the new file's layouts, without needing a manual rebuild", () => {
    const mm = hubModel();
    const im = hubIm([{ id: 'c1', sourceObjectId: 'hub', sourcePortId: 'h1', targetObjectId: 'top', targetPortId: 'q' }]);

    // An earlier model with different (here: no) layouts is already loaded.
    useModelStore.getState().loadFromJSON({ metaModel: mm, instanceModels: [im], layouts: {} });
    expect(useCapsuleStructureStore.getState().nodes.find((n) => n.id === 'hub').position).not.toEqual({ x: 777, y: 333 });

    useModelStore.getState().loadFromJSON({
      metaModel: mm, instanceModels: [im],
      layouts: { 'cs-IM': { hub: { x: 777, y: 333 }, top: { x: 10, y: 20 } } },
    });
    const nodes = useCapsuleStructureStore.getState().nodes;
    expect(nodes.find((n) => n.id === 'hub').position).toEqual({ x: 777, y: 333 });
    expect(nodes.find((n) => n.id === 'top').position).toEqual({ x: 10, y: 20 });
  });

  it("does not inherit the previous model's layouts when the new file has none", () => {
    const mm = hubModel();
    const im = hubIm([]);
    useModelStore.getState().loadFromJSON({ metaModel: mm, instanceModels: [im], layouts: { 'cs-IM': { hub: { x: 777, y: 333 } } } });
    useModelStore.getState().loadFromJSON({ metaModel: mm, instanceModels: [im] });
    expect(useModelStore.getState().layouts).toEqual({});
  });
});
