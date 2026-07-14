import { describe, it, expect } from 'vitest';
import { computePortRows } from './capsuleStructureStore.js';

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
