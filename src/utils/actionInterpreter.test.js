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

describe('applyActionCode — conditional blocks', () => {
  it('evaluates a true condition and actually applies the guarded increment', () => {
    const code = 'if (count < 10) {\n  count++;\n  log.log("PING " + count);\n  pinger.ping();\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '4' });
  });

  it('evaluates a false condition and does NOT execute the guarded block (fixed point)', () => {
    const code = 'if (count < 10) {\n  count++;\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '10' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '10' });
  });

  it('degrades to unknown when the condition itself cannot be evaluated (base value unknown)', () => {
    const code = 'if (count < 10) {\n  count++;\n}';
    const result = applyActionCode(code, attrIndex, unknownValues());
    expect(result.get('aCount')).toEqual({ kind: 'unknown' });
  });

  it('takes the else branch when the condition is false', () => {
    const code = 'if (count < 10) {\n  ready = true;\n} else {\n  ready = false;\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '10' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aFlag')).toEqual({ kind: 'known', value: 'false' });
  });

  it('takes the then branch when the condition is true, leaving the else branch unapplied', () => {
    const code = 'if (count < 10) {\n  ready = true;\n} else {\n  ready = false;\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aFlag')).toEqual({ kind: 'known', value: 'true' });
  });

  it('still applies an unconditional (top-level) assignment alongside a guarded block', () => {
    const code = 'direction = "NS";\nif (count < 10) {\n  count++;\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aName')).toEqual({ kind: 'known', value: 'NS' });
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '4' });
  });

  it('resumes treating lines as unconditional once the block closes', () => {
    const code = 'if (count < 10) {\n  count++;\n}\ndirection = "EW";';
    const result = applyActionCode(code, attrIndex, unknownValues());
    expect(result.get('aCount')).toEqual({ kind: 'unknown' });
    expect(result.get('aName')).toEqual({ kind: 'known', value: 'EW' });
  });

  it('evaluates nested blocks when every level is evaluable', () => {
    const code = 'if (ready) {\n  if (count < 10) {\n    count++;\n  }\n}';
    const values = unknownValues();
    values.set('aFlag', { kind: 'known', value: 'true' });
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '4' });
  });

  it('degrades only the inner attribute when an outer condition is true but the inner one cannot be evaluated', () => {
    const code = 'if (ready) {\n  if (count < 10) {\n    count++;\n  }\n}';
    const values = unknownValues();
    values.set('aFlag', { kind: 'known', value: 'true' }); // outer evaluates true
    // aCount left unknown — inner condition can't be evaluated
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'unknown' });
  });

  it('supports a bare boolean attribute and its negation as a condition', () => {
    const values = unknownValues();
    values.set('aFlag', { kind: 'known', value: 'true' });
    expect(applyActionCode('if (ready) {\n  count = 1;\n}', attrIndex, values).get('aCount'))
      .toEqual({ kind: 'known', value: '1' });
    expect(applyActionCode('if (!ready) {\n  count = 1;\n}', attrIndex, values).get('aCount'))
      .toEqual({ kind: 'unknown' }); // condition false, no else — untouched (stays unknown, its starting kind)
  });

  it('falls back to the safe flat-degrade behavior for an unsupported shape (else-if chain)', () => {
    const code = 'if (count < 5) {\n  ready = true;\n} else if (count < 10) {\n  ready = false;\n}';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    // Not silently misapplied either way — degrades rather than guessing which branch (if any) ran.
    expect(result.get('aFlag')).toEqual({ kind: 'unknown' });
  });

  it('leaves a value untouched (not misapplied) for an unsupported same-line block', () => {
    // The whole line "if (count < 10) { count++; }" doesn't match any
    // single-statement regex as a unit, so the flat-degrade fallback's
    // per-line scan finds nothing recognizable and treats it as a no-op —
    // stale rather than "unknown", but never a wrongly-applied value. This
    // shape doesn't appear in any real model seen so far (multi-line
    // brace formatting is universal in practice); documented gap, not fixed.
    const code = 'if (count < 10) { count++; }';
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '3' });
  });
});
