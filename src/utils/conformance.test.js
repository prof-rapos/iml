import { describe, it, expect } from 'vitest';
import { validateConformance, parseMult, multDesc, isConformantClass } from './conformance.js';

// Small helpers to keep each test's fixture minimal.
const mmAttr = (attr, enumerations = []) => ({
  name: 'M', enumerations,
  classes: [{ id: 'C', name: 'C', attributes: [attr] }],
  relations: [],
});
const imVal = (attrId, value) => ({
  objects: [{ id: 'o', classId: 'C', name: 'obj', attributeValues: { [attrId]: value } }],
  links: [],
});
const msgs = (errors) => errors.map((e) => e.msg);

describe('validateConformance — meta-model level', () => {
  it('reports a class with multiple parents', () => {
    const mm = {
      name: 'M', enumerations: [],
      classes: [{ id: 'P1', name: 'P1', attributes: [] }, { id: 'P2', name: 'P2', attributes: [] }, { id: 'C', name: 'C', attributes: [] }],
      relations: [
        { id: 'r1', kind: 'INHERITANCE', source: 'C', target: 'P1' },
        { id: 'r2', kind: 'INHERITANCE', source: 'C', target: 'P2' },
      ],
    };
    const errors = validateConformance(mm, { objects: [], links: [] });
    expect(errors).toContainEqual(expect.objectContaining({ kind: 'class', id: 'C' }));
  });

  it('reports an unnamed reference/composition relation but not inheritance', () => {
    const mm = {
      name: 'M', enumerations: [],
      classes: [{ id: 'A', name: 'A', attributes: [] }, { id: 'B', name: 'B', attributes: [] }],
      relations: [
        { id: 'ref', kind: 'REFERENCE',   source: 'A', target: 'B', name: '' },
        { id: 'inh', kind: 'INHERITANCE', source: 'A', target: 'B', name: '' },
      ],
    };
    const errors = validateConformance(mm, { objects: [], links: [] });
    expect(errors.filter((e) => e.kind === 'relation')).toHaveLength(1);
    expect(errors[0].id).toBe('ref');
  });

  it('accepts a clean model with no errors', () => {
    const errors = validateConformance(
      mmAttr({ id: 'a', name: 'x', type: 'STRING', lowerBound: 0, upperBound: 1 }),
      imVal('a', 'hello'),
    );
    expect(errors).toEqual([]);
  });
});

// Regression: nothing validated state-machine content before this — a
// duplicate state name or a transition whose trigger had gone stale after
// a port/signal rename or delete both produced Java that failed to compile,
// with no warning anywhere pointing back at the real cause.
describe('validateConformance — behavioural (state machines)', () => {
  const baseCls = (behaviours) => ({
    name: 'M', enumerations: [],
    classes: [{
      id: 'C', name: 'Account', attributes: [],
      ports: [{ id: 'pOps', name: 'ops', protocolId: 'proto1', conjugated: false }],
    }],
    relations: [],
    protocols: [{ id: 'proto1', name: 'banking', signals: [{ id: 's1', name: 'deposit', direction: 'in', params: [] }] }],
    behaviours,
  });

  it('flags two simple states with the same name', () => {
    const mm = baseCls({
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 's1', kind: 'simple', name: 'Open', entry: '', exit: '' },
          { id: 's2', kind: 'simple', name: 'Open', entry: '', exit: '' },
        ],
        transitions: [],
      },
    });
    const errors = validateConformance(mm, { objects: [], links: [] });
    expect(errors).toContainEqual(expect.objectContaining({ kind: 'state', id: 's2' }));
  });

  it('does not flag Initial/Final pseudostates sharing an empty name', () => {
    const mm = baseCls({
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sFinal', kind: 'final', name: '', entry: '', exit: '' },
        ],
        // A single outgoing transition from the initial pseudostate so this
        // fixture stays valid under the separate "initial transition" checks
        // below — this test is only about duplicate-name detection.
        transitions: [{ id: 't1', source: 'sInit', target: 'sFinal', trigger: '', guard: '', effect: '' }],
      },
    });
    expect(validateConformance(mm, { objects: [], links: [] }).filter((e) => e.kind === 'state')).toEqual([]);
  });

  it('flags a transition whose trigger does not resolve to any current port/signal', () => {
    const mm = baseCls({
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 's1', kind: 'simple', name: 'Open', entry: '', exit: '' },
          { id: 's2', kind: 'simple', name: 'Closed', entry: '', exit: '' },
        ],
        // "ops.withdraw" doesn't exist on the "banking" protocol — e.g. the
        // signal was renamed to "deposit" after this transition was drawn.
        transitions: [{ id: 't1', source: 's1', target: 's2', trigger: 'ops.withdraw', guard: '', effect: '' }],
      },
    });
    const errors = validateConformance(mm, { objects: [], links: [] });
    expect(errors).toContainEqual(expect.objectContaining({ kind: 'transition', id: 't1' }));
  });

  it('accepts a transition whose trigger resolves to a real signal', () => {
    const mm = baseCls({
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 's1', kind: 'simple', name: 'Open', entry: '', exit: '' },
          { id: 's2', kind: 'simple', name: 'Closed', entry: '', exit: '' },
        ],
        transitions: [{ id: 't1', source: 's1', target: 's2', trigger: 'ops.deposit', guard: '', effect: '' }],
      },
    });
    expect(validateConformance(mm, { objects: [], links: [] }).filter((e) => e.kind === 'transition')).toEqual([]);
  });

  it('accepts a system-protocol trigger (timer.timeout) without flagging it as unresolved', () => {
    const mm = {
      name: 'M', enumerations: [],
      classes: [{
        id: 'C', name: 'Blinker', attributes: [],
        ports: [{ id: 'pTim', name: 'timer', protocolId: 'sys-timing', conjugated: false }],
      }],
      relations: [], protocols: [],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 's1', kind: 'simple', name: 'On', entry: '', exit: '' },
            { id: 's2', kind: 'simple', name: 'Off', entry: '', exit: '' },
          ],
          transitions: [{ id: 't1', source: 's1', target: 's2', trigger: 'timer.timeout', guard: '', effect: '' }],
        },
      },
    };
    expect(validateConformance(mm, { objects: [], links: [] }).filter((e) => e.kind === 'transition')).toEqual([]);
  });

  it('ignores an untriggered transition (e.g. the initial pseudostate\'s own transition)', () => {
    const mm = baseCls({
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 's1', kind: 'simple', name: 'Open', entry: '', exit: '' },
        ],
        transitions: [{ id: 't1', source: 'sInit', target: 's1', trigger: '', guard: '', effect: '' }],
      },
    });
    expect(validateConformance(mm, { objects: [], links: [] }).filter((e) => e.kind === 'transition')).toEqual([]);
  });
});

describe('validateConformance — object & attribute rules', () => {
  it('flags an object of an unknown class', () => {
    const mm = { name: 'M', enumerations: [], classes: [], relations: [] };
    const im = { objects: [{ id: 'o', classId: 'X', name: 'obj', attributeValues: {} }], links: [] };
    expect(msgs(validateConformance(mm, im)).join()).toMatch(/unknown class/);
  });

  it('flags instantiation of an abstract class', () => {
    const mm = { name: 'M', enumerations: [], classes: [{ id: 'C', name: 'C', isAbstract: true, attributes: [] }], relations: [] };
    const im = { objects: [{ id: 'o', classId: 'C', name: 'obj', attributeValues: {} }], links: [] };
    expect(msgs(validateConformance(mm, im)).join()).toMatch(/abstract/);
  });

  it('flags an empty required (single) attribute', () => {
    const mm = mmAttr({ id: 'a', name: 'x', type: 'STRING', lowerBound: 1, upperBound: 1 });
    expect(msgs(validateConformance(mm, imVal('a', ''))).join()).toMatch(/required/);
  });

  it('checks single-valued primitive types', () => {
    const int = mmAttr({ id: 'a', name: 'n', type: 'INT', lowerBound: 0, upperBound: 1 });
    expect(validateConformance(int, imVal('a', '5'))).toEqual([]);
    expect(msgs(validateConformance(int, imVal('a', 'abc'))).join()).toMatch(/integer/);

    const dbl = mmAttr({ id: 'a', name: 'd', type: 'DOUBLE', lowerBound: 0, upperBound: 1 });
    expect(msgs(validateConformance(dbl, imVal('a', 'x'))).join()).toMatch(/number/);

    const bool = mmAttr({ id: 'a', name: 'b', type: 'BOOLEAN', lowerBound: 0, upperBound: 1 });
    expect(msgs(validateConformance(bool, imVal('a', 'yes'))).join()).toMatch(/true or false/);
  });

  it('checks multi-valued bounds and element types', () => {
    const few = mmAttr({ id: 'a', name: 'xs', type: 'STRING', lowerBound: 2, upperBound: -1 });
    expect(msgs(validateConformance(few, imVal('a', ['only']))).join()).toMatch(/at least 2/);

    const many = mmAttr({ id: 'a', name: 'xs', type: 'STRING', lowerBound: 0, upperBound: 2 });
    expect(msgs(validateConformance(many, imVal('a', ['x', 'y', 'z']))).join()).toMatch(/at most 2/);

    const ints = mmAttr({ id: 'a', name: 'ns', type: 'INT', lowerBound: 0, upperBound: -1 });
    expect(validateConformance(ints, imVal('a', ['1', '2']))).toEqual([]);
    expect(msgs(validateConformance(ints, imVal('a', ['1', 'x']))).join()).toMatch(/integers/);
  });

  it('validates enum values against the enumeration literals', () => {
    const enums = [{ id: 'e', name: 'Color', literals: ['RED', 'GREEN'] }];
    const mm = mmAttr({ id: 'a', name: 'c', type: 'ENUM', enumId: 'e', lowerBound: 0, upperBound: 1 }, enums);
    expect(validateConformance(mm, imVal('a', 'RED'))).toEqual([]);
    expect(msgs(validateConformance(mm, imVal('a', 'BLUE'))).join()).toMatch(/must be one of Color/);
  });

  it('flags an enum attribute pointing at a missing enumeration', () => {
    const mm = mmAttr({ id: 'a', name: 'c', type: 'ENUM', enumId: 'gone', lowerBound: 0, upperBound: 1 }, []);
    expect(msgs(validateConformance(mm, imVal('a', 'RED'))).join()).toMatch(/undefined enumeration/);
  });
});

describe('validateConformance — links & relation multiplicity', () => {
  // Owner --pets--> Animal, with Dog a subclass of Animal.
  const baseClasses = [
    { id: 'Animal', name: 'Animal', attributes: [] },
    { id: 'Dog',    name: 'Dog',    attributes: [] },
    { id: 'Owner',  name: 'Owner',  attributes: [] },
  ];
  const inh = { id: 'inh', kind: 'INHERITANCE', source: 'Dog', target: 'Animal' };

  it('accepts a link whose endpoint is a subclass of the declared class', () => {
    const mm = {
      name: 'M', enumerations: [], classes: baseClasses,
      relations: [inh, { id: 'pets', kind: 'REFERENCE', source: 'Owner', target: 'Animal', name: 'pets', sourceMultiplicity: '', targetMultiplicity: '' }],
    };
    const im = {
      objects: [{ id: 'ow', classId: 'Owner', name: 'Bob', attributeValues: {} }, { id: 'dg', classId: 'Dog', name: 'Rex', attributeValues: {} }],
      links: [{ id: 'l1', relationId: 'pets', source: 'ow', target: 'dg' }],
    };
    expect(validateConformance(mm, im)).toEqual([]);
  });

  it('flags a link whose target class does not conform', () => {
    const mm = {
      name: 'M', enumerations: [], classes: baseClasses,
      relations: [inh, { id: 'pets', kind: 'REFERENCE', source: 'Owner', target: 'Animal', name: 'pets', sourceMultiplicity: '', targetMultiplicity: '' }],
    };
    const im = {
      objects: [{ id: 'ow', classId: 'Owner', name: 'Bob', attributeValues: {} }, { id: 'ow2', classId: 'Owner', name: 'Al', attributeValues: {} }],
      links: [{ id: 'l1', relationId: 'pets', source: 'ow', target: 'ow2' }],
    };
    const errors = validateConformance(mm, im);
    expect(errors.some((e) => e.kind === 'link' && /expected "Animal"/.test(e.msg))).toBe(true);
  });

  it('flags a target-multiplicity violation (too few links)', () => {
    const mm = {
      name: 'M', enumerations: [], classes: baseClasses,
      relations: [inh, { id: 'pets', kind: 'REFERENCE', source: 'Owner', target: 'Animal', name: 'pets', sourceMultiplicity: '', targetMultiplicity: '1..*' }],
    };
    const im = { objects: [{ id: 'ow', classId: 'Owner', name: 'Bob', attributeValues: {} }], links: [] };
    expect(msgs(validateConformance(mm, im)).join()).toMatch(/needs at least 1 Animal/);
  });

  it('accepts a satisfied target multiplicity', () => {
    const mm = {
      name: 'M', enumerations: [], classes: baseClasses,
      relations: [inh, { id: 'pets', kind: 'REFERENCE', source: 'Owner', target: 'Animal', name: 'pets', sourceMultiplicity: '', targetMultiplicity: '1..*' }],
    };
    const im = {
      objects: [{ id: 'ow', classId: 'Owner', name: 'Bob', attributeValues: {} }, { id: 'dg', classId: 'Dog', name: 'Rex', attributeValues: {} }],
      links: [{ id: 'l1', relationId: 'pets', source: 'ow', target: 'dg' }],
    };
    expect(validateConformance(mm, im)).toEqual([]);
  });
});

describe('validateConformance — robustness', () => {
  it('handles a missing instance model as empty', () => {
    const mm = { name: 'M', enumerations: [], classes: [{ id: 'C', name: 'C', attributes: [] }], relations: [] };
    expect(validateConformance(mm, undefined)).toEqual([]);
  });
});

describe('parseMult / multDesc helpers', () => {
  it('parses multiplicity strings', () => {
    expect(parseMult('')).toBeNull();
    expect(parseMult('*')).toEqual({ lower: 0, upper: Infinity });
    expect(parseMult('3')).toEqual({ lower: 3, upper: 3 });
    expect(parseMult('1..*')).toEqual({ lower: 1, upper: Infinity });
    expect(parseMult('2..5')).toEqual({ lower: 2, upper: 5 });
  });

  it('describes multiplicity bounds', () => {
    expect(multDesc({ lower: 2, upper: 2 })).toMatch(/exactly 2/);
    expect(multDesc({ lower: 0, upper: Infinity })).toMatch(/any number/);
    expect(multDesc({ lower: 1, upper: Infinity })).toMatch(/at least 1/);
    expect(multDesc({ lower: 0, upper: 3 })).toMatch(/at most 3/);
    expect(multDesc({ lower: 2, upper: 5 })).toMatch(/between 2 and 5/);
  });
});

describe('isConformantClass', () => {
  const rels = [{ kind: 'INHERITANCE', source: 'Dog', target: 'Animal' }];
  it('is true for the same class and for subclasses', () => {
    expect(isConformantClass('Dog', 'Dog', rels)).toBe(true);
    expect(isConformantClass('Dog', 'Animal', rels)).toBe(true);
  });
  it('is false for unrelated classes', () => {
    expect(isConformantClass('Animal', 'Dog', rels)).toBe(false);
    expect(isConformantClass('Cat', 'Animal', rels)).toBe(false);
  });
});
