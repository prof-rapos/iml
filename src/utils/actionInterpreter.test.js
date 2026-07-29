import { describe, it, expect } from 'vitest';
import { applyActionCode, parseActionLine } from './actionInterpreter.js';

const attrs = [
  { id: 'aColor', name: 'lightColor', type: 'ENUM' },
  { id: 'aCount', name: 'count', type: 'INT' },
  { id: 'aName', name: 'direction', type: 'STRING' },
  { id: 'aFlag', name: 'ready', type: 'BOOLEAN' },
];
const attrIndex = new Map(attrs.map((a) => [a.name, a]));

function unknownValues() {
  return new Map(attrs.map((a) => [a.id, { kind: 'unknown' }]));
}

describe('parseActionLine — literals', () => {
  it('recognizes an enum literal assignment', () => {
    const r = parseActionLine('lightColor = LightValue.RED', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aColor', value: { kind: 'known', value: 'RED' } });
  });

  it('recognizes a numeric literal assignment', () => {
    const r = parseActionLine('count = 5', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'known', value: '5' } });
  });

  it('recognizes a string literal assignment', () => {
    const r = parseActionLine('direction = "NS"', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aName', value: { kind: 'known', value: 'NS' } });
  });

  it('recognizes a boolean literal assignment', () => {
    const r = parseActionLine('ready = true', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aFlag', value: { kind: 'known', value: 'true' } });
  });
});

describe('parseActionLine — self-referential arithmetic', () => {
  it('computes count = count + 1 when count is known', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const r = parseActionLine('count = count + 1', attrIndex, values);
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'known', value: '4' } });
  });

  it('computes count++', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const r = parseActionLine('count++', attrIndex, values);
    expect(r.value).toEqual({ kind: 'known', value: '4' });
  });

  it('computes count += 2', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const r = parseActionLine('count += 2', attrIndex, values);
    expect(r.value).toEqual({ kind: 'known', value: '5' });
  });

  it('falls back to unknown when the base value is not known', () => {
    const r = parseActionLine('count = count + 1', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'unknown' } });
  });

  it('does NOT treat cross-attribute arithmetic as self-referential', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const r = parseActionLine('count = otherAttr + 1', attrIndex, values);
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'unknown' } });
  });
});

describe('parseActionLine — unrecognized forms and no-ops', () => {
  it('marks an attribute unknown when assigned a method call', () => {
    const r = parseActionLine('count = computeSomething()', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'unknown' } });
  });

  it('returns null (no-op) for a line not touching any tracked attribute', () => {
    expect(parseActionLine('oppositeOut.safe()', attrIndex, unknownValues())).toBeNull();
    expect(parseActionLine('log.log(direction)', attrIndex, unknownValues())).toBeNull();
  });

  it('returns null for an assignment to an untracked identifier', () => {
    expect(parseActionLine('someLocal = 5', attrIndex, unknownValues())).toBeNull();
  });
});

describe('applyActionCode', () => {
  it('processes multiple lines in order and only updates touched attributes', () => {
    const result = applyActionCode(
      'lightColor = LightValue.RED;\noppositeOut.safe();\ncount = 5;',
      attrIndex,
      unknownValues(),
    );
    expect(result.get('aColor')).toEqual({ kind: 'known', value: 'RED' });
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '5' });
    expect(result.get('aName')).toEqual({ kind: 'unknown' });
  });

  it('returns the same map reference for empty/blank code', () => {
    const values = unknownValues();
    expect(applyActionCode('', attrIndex, values)).toBe(values);
    expect(applyActionCode('   ', attrIndex, values)).toBe(values);
  });

  it('does not mutate the input map', () => {
    const values = unknownValues();
    applyActionCode('count = 5;', attrIndex, values);
    expect(values.get('aCount')).toEqual({ kind: 'unknown' });
  });
});
