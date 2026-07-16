import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';

function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'M',
      classes: [
        { id: 'A', name: 'A', attributes: [] },
        { id: 'B', name: 'B', attributes: [] },
      ],
      relations: [], enumerations: [], behaviours: {}, protocols: [],
    },
    instanceModels: [{ id: 'im1', kind: 'instancemodel', name: 'IM1', objects: [], links: [], connectors: [] }],
    currentIMIndex: 0,
    mode: 'metamodel',
    layouts: {},
  });
}
const mm = () => useModelStore.getState().metaModel;

describe('relations — cycle/self-loop/name validation on update', () => {
  beforeEach(seed);

  it('addRelation still rejects a self-loop inheritance/composition', () => {
    expect(useModelStore.getState().addRelation('INHERITANCE', 'A', 'A')).toBeNull();
    expect(useModelStore.getState().addRelation('COMPOSITION', 'A', 'A')).toBeNull();
  });

  it('updateRelation rejects flipping a relation into an inheritance cycle', () => {
    const ab = useModelStore.getState().addRelation('REFERENCE', 'A', 'B');
    const ba = useModelStore.getState().addRelation('REFERENCE', 'B', 'A');

    expect(useModelStore.getState().updateRelation(ab, { kind: 'INHERITANCE' })).toBe(true);
    // B -> A as INHERITANCE too would close the cycle A extends B extends A.
    expect(useModelStore.getState().updateRelation(ba, { kind: 'INHERITANCE' })).toBe(false);
    expect(mm().relations.find((r) => r.id === ba).kind).toBe('REFERENCE'); // unchanged
  });

  it('updateRelation rejects reconnecting an edge endpoint into a self-loop', () => {
    const rel = useModelStore.getState().addRelation('REFERENCE', 'A', 'B');
    expect(useModelStore.getState().updateRelation(rel, { kind: 'COMPOSITION', target: 'A' })).toBe(false);
    expect(mm().relations.find((r) => r.id === rel)).toMatchObject({ kind: 'REFERENCE', target: 'B' });
  });

  it('updateRelation rejects a relation name colliding with a sibling relation from the same source class', () => {
    const r1 = useModelStore.getState().addRelation('REFERENCE', 'A', 'B');
    const r2 = useModelStore.getState().addRelation('REFERENCE', 'A', 'B');
    useModelStore.getState().updateRelation(r1, { name: 'items' });

    expect(useModelStore.getState().updateRelation(r2, { name: 'items' })).toBe(false);
    expect(mm().relations.find((r) => r.id === r2).name).toBe('');
  });

  it('deleteRelation prunes instance-model links that referenced it', () => {
    const rel   = useModelStore.getState().addRelation('REFERENCE', 'A', 'B');
    const objA  = useModelStore.getState().addObject('A');
    const objB  = useModelStore.getState().addObject('B');
    const linkId = useModelStore.getState().addLink(rel, objA, objB);

    useModelStore.getState().deleteRelation(rel);

    expect(mm().relations.some((r) => r.id === rel)).toBe(false);
    expect(useModelStore.getState().instanceModels[0].links.some((l) => l.id === linkId)).toBe(false);
  });
});

describe('instance models — delete index math and cross-view isolation', () => {
  beforeEach(seed);

  it('selects the still-open instance model after deleting one that sat before it', () => {
    useModelStore.getState().addInstanceModel(); // idx 1
    useModelStore.getState().addInstanceModel(); // idx 2
    useModelStore.setState({ currentIMIndex: 2 });
    const keptId = useModelStore.getState().instanceModels[2].id;

    useModelStore.getState().deleteInstanceModel(0);

    const s = useModelStore.getState();
    expect(s.instanceModels[s.currentIMIndex].id).toBe(keptId);
  });

  it('switchInstanceModel leaves the shared canvas untouched when Structural Modeling is not in instance mode', () => {
    useModelStore.getState().addInstanceModel();
    useModelStore.setState({ mode: 'metamodel', nodes: [{ id: 'sentinel' }], edges: [] });

    useModelStore.getState().switchInstanceModel(0);

    expect(useModelStore.getState().nodes).toEqual([{ id: 'sentinel' }]);
  });

  it('switchInstanceModel still rebuilds the canvas when Structural Modeling is already in instance mode', () => {
    useModelStore.getState().addInstanceModel();
    useModelStore.setState({ mode: 'instance', nodes: [{ id: 'sentinel' }], edges: [] });

    useModelStore.getState().switchInstanceModel(0);

    expect(useModelStore.getState().nodes.some((n) => n.id === 'sentinel')).toBe(false);
  });
});

describe('enumerations — literal rename validation', () => {
  beforeEach(seed);

  it('updateEnumLiteral rejects renaming to a duplicate sibling literal or an empty value', () => {
    const enumId = useModelStore.getState().addEnumeration();
    useModelStore.getState().addEnumLiteral(enumId, 'RED');
    useModelStore.getState().addEnumLiteral(enumId, 'GREEN');

    useModelStore.getState().updateEnumLiteral(enumId, 1, 'RED');
    expect(mm().enumerations.find((e) => e.id === enumId).literals).toEqual(['RED', 'GREEN']);

    useModelStore.getState().updateEnumLiteral(enumId, 1, '');
    expect(mm().enumerations.find((e) => e.id === enumId).literals).toEqual(['RED', 'GREEN']);

    useModelStore.getState().updateEnumLiteral(enumId, 1, 'BLUE');
    expect(mm().enumerations.find((e) => e.id === enumId).literals).toEqual(['RED', 'BLUE']);
  });
});
