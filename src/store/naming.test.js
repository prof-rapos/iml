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

// isJavaKeyword rejects any case-variant of a reserved word or shadowed
// stdlib class name, not just an exact match — a name that differs from
// "class"/"String" only in case reads as a mistake, not a deliberate
// choice. Safe to check eagerly (not just on exact match) because
// validation only ever fires on blur/commit (NameInput.jsx), never
// per-keystroke, so it can't reject "Do" the instant it's typed while
// aiming for "Donut".
describe('updateClass — reserved-keyword check is case-insensitive', () => {
  beforeEach(seed);

  it('rejects a case-variant of a keyword ("Do", not just "do")', () => {
    useModelStore.getState().updateClass('A', { name: 'Do' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('still rejects the exact-case reserved word', () => {
    useModelStore.getState().updateClass('A', { name: 'do' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('rejects a lowercase name that collides case-insensitively with a shadowed stdlib class ("string" vs "String")', () => {
    useModelStore.getState().updateClass('A', { name: 'string' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('accepts a name that merely contains a keyword as a substring ("Classroom")', () => {
    useModelStore.getState().updateClass('A', { name: 'Classroom' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('Classroom');
  });
});

describe('updateClass — identifier-format check', () => {
  beforeEach(seed);

  it('rejects names with spaces or punctuation', () => {
    useModelStore.getState().updateClass('A', { name: 'My Class!' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('rejects a name starting with a digit', () => {
    useModelStore.getState().updateClass('A', { name: '1Class' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('A');
  });

  it('accepts underscores and a leading underscore/dollar sign', () => {
    useModelStore.getState().updateClass('A', { name: '_My$Class_1' });
    expect(useModelStore.getState().metaModel.classes[0].name).toBe('_My$Class_1');
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

  it('updateObject rejects a keyword-colliding or invalid-identifier name', () => {
    const s = useModelStore.getState();
    const id1 = s.addObject('A');
    s.updateObject(id1, { name: 'class' });
    expect(useModelStore.getState().instanceModels[0].objects[0].name).toBe('A1');
    s.updateObject(id1, { name: 'has a space' });
    expect(useModelStore.getState().instanceModels[0].objects[0].name).toBe('A1');
  });
});

// Ports had no keyword/format validation at all — a port named "class" or
// with spaces/punctuation would compile down to broken generated Java
// (portFieldName only sanitizes characters via safeId, it doesn't reject a
// name that's already a valid-but-reserved identifier).
describe('updatePort — keyword and identifier-format validation', () => {
  beforeEach(seed);

  it('rejects a keyword-colliding port name', () => {
    const s = useModelStore.getState();
    const portId = s.addPort('A');
    s.updatePort('A', portId, { name: 'class' });
    const port = useModelStore.getState().metaModel.classes[0].ports.find((p) => p.id === portId);
    expect(port.name).toBe('port');
  });

  it('rejects a port name with invalid characters', () => {
    const s = useModelStore.getState();
    const portId = s.addPort('A');
    s.updatePort('A', portId, { name: 'my-port' });
    const port = useModelStore.getState().metaModel.classes[0].ports.find((p) => p.id === portId);
    expect(port.name).toBe('port');
  });
});
