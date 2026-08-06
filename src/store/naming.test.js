import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';

function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'MyProject',
      classes: [{ id: 'A', name: 'A', attributes: [] }],
      relations: [], enumerations: [], behaviours: {}, protocols: [],
    },
    instanceModels: [{ id: 'im1', kind: 'instancemodel', name: 'IM1', objects: [], links: [], connectors: [] }],
    currentIMIndex: 0,
    mode: 'metamodel',
    layouts: { mm: { A: { x: 1, y: 1 } } },
  });
}

describe('clearMetaModel', () => {
  beforeEach(seed);

  it('resets the meta-model name, not just its classes', () => {
    useModelStore.getState().clearMetaModel();
    expect(useModelStore.getState().metaModel.name).not.toBe('MyProject');
  });
});

// Regression: isJavaKeyword used to also reject any case-variant of a
// reserved word (name.toLowerCase() against the keyword set) — Java
// identifiers are case-sensitive, so this blocked perfectly legal names
// like "Do" (typing toward "Donut") purely because "do" is reserved.
describe('updateClass — reserved-keyword check is case-sensitive', () => {
  beforeEach(seed);

  it('accepts a name that is a case-variant of a keyword ("Do", not "do")', () => {
    useModelStore.getState().updateClass('A', { name: 'Do' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('Do');
  });

  it('still rejects the exact-case reserved word', () => {
    useModelStore.getState().updateClass('A', { name: 'do' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('accepts a lowercase name that only collides case-insensitively with a shadowed stdlib class ("string" vs "String")', () => {
    useModelStore.getState().updateClass('A', { name: 'string' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('string');
  });
});

// Regression: addObject always named a new object "<ClassName>1" with no
// collision check (unlike every other auto-named entity in the app), and
// updateObject had no uniqueness validation at all — two objects, even of
// different classes, could end up with the identical name, which both reads
// ambiguously in the diagram and collides in generated code's local
// variable names (buildVarNames in javaCodeGen.js only silently
// disambiguates the *generated* name, it doesn't reflect back onto the
// model).
describe('instance object naming', () => {
  beforeEach(seed);

  it('addObject auto-increments against existing names in the instance model', () => {
    const s = useModelStore.getState();
    const id1 = s.addObject('A');
    const id2 = s.addObject('A');
    const objs = useModelStore.getState().instanceModels[0].objects;
    expect(objs.find((o) => o.id === id1).name).toBe('A1');
    expect(objs.find((o) => o.id === id2).name).toBe('A2');
  });

  it('updateObject rejects renaming to a name already used by another object', () => {
    const s = useModelStore.getState();
    const id1 = s.addObject('A');
    const id2 = s.addObject('A');
    s.updateObject(id2, { name: 'A1' });
    const objs = useModelStore.getState().instanceModels[0].objects;
    expect(objs.find((o) => o.id === id1).name).toBe('A1');
    expect(objs.find((o) => o.id === id2).name).toBe('A2'); // unchanged
  });

  it('updateObject still allows renaming an object to its own current name (no-op)', () => {
    const s = useModelStore.getState();
    const id1 = s.addObject('A');
    s.updateObject(id1, { name: 'A1' });
    expect(useModelStore.getState().instanceModels[0].objects[0].name).toBe('A1');
  });
});
