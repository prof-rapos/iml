import { describe, it, expect } from 'vitest';
import { applyActionCode, parseActionLine, evaluateCondition, describeUnresolvedGuard } from './actionInterpreter.js';

const attrs = [
  { id: 'aColor', name: 'lightColor', type: 'ENUM' },
  { id: 'aCount', name: 'count', type: 'INT' },
  { id: 'aName', name: 'direction', type: 'STRING' },
  { id: 'aFlag', name: 'ready', type: 'BOOLEAN' },
  { id: 'aPrice', name: 'price', type: 'DOUBLE' },
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

  // Regression: division on an INT attribute previously tracked plain JS
  // float division (5/2 -> 2.5), but real generated Java does integer
  // division on an `int` field (5/2 -> 2, truncated toward zero) — the
  // tracked value silently diverged from what the actual capsule would
  // compute, misleading both the SET display and any generated assertion.
  it('truncates INT division toward zero, matching Java int division', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '5' });
    const r = parseActionLine('count = count / 2', attrIndex, values);
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'known', value: '2' } });
  });

  it('truncates negative INT division toward zero (not floor)', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '-5' });
    const r = parseActionLine('count = count / 2', attrIndex, values);
    // Math.trunc(-2.5) === -2 (toward zero); Math.floor(-2.5) would be -3 and
    // would be wrong here — Java's `/` truncates toward zero too.
    expect(r).toEqual({ attrId: 'aCount', value: { kind: 'known', value: '-2' } });
  });

  it('does NOT truncate division on a DOUBLE attribute', () => {
    const values = unknownValues();
    values.set('aPrice', { kind: 'known', value: '5' });
    const r = parseActionLine('price = price / 2', attrIndex, values);
    expect(r).toEqual({ attrId: 'aPrice', value: { kind: 'known', value: '2.5' } });
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

// Regression: `p1Move = move;` (copying a signal parameter, or any other
// currently-known identifier, into a tracked attribute) used to always
// degrade to unknown — parseLiteral only recognized literal syntax
// (quotes/numbers/bools/enum-dot-form), never "look up another identifier's
// current value."
describe('parseActionLine — copying a known identifier\'s value through', () => {
  it('copies another tracked attribute\'s current known value', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('lastDirection', { id: 'aLastDir', type: 'STRING' });
    const values = unknownValues();
    values.set('aLastDir', { kind: 'known', value: 'NS' });
    const r = parseActionLine('direction = lastDirection', twoStrings, values);
    expect(r).toEqual({ attrId: 'aName', value: { kind: 'known', value: 'NS' } });
  });

  it('copies a signal-parameter-injected value (same mechanism symbolicExecution.js uses)', () => {
    // A signal parameter is injected into attrIndex/values exactly like a
    // tracked attribute for the duration of one transition — simulate that
    // here with a synthetic "move" entry.
    const paramAttrIndex = new Map(attrIndex);
    paramAttrIndex.set('move', { id: 'pMove', type: 'STRING' });
    const values = unknownValues();
    values.set('pMove', { kind: 'known', value: 'ROCK' });
    const r = parseActionLine('direction = move', paramAttrIndex, values);
    expect(r).toEqual({ attrId: 'aName', value: { kind: 'known', value: 'ROCK' } });
  });

  it('still degrades to unknown when the RHS identifier is not currently known', () => {
    const paramAttrIndex = new Map(attrIndex);
    paramAttrIndex.set('move', { id: 'pMove', type: 'STRING' });
    const r = parseActionLine('direction = move', paramAttrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aName', value: { kind: 'unknown' } });
  });

  it('still degrades to unknown for a genuinely untracked RHS identifier (not a typo-proofing regression)', () => {
    const r = parseActionLine('direction = someLocalVar', attrIndex, unknownValues());
    expect(r).toEqual({ attrId: 'aName', value: { kind: 'unknown' } });
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

// Regression: `if (cond) stmt;` with NO braces at all — a very common Java
// style — used to be neither classified 'if' (RE_IF requires a trailing
// "{") nor 'unsupported' (no braces at all to trigger the flat-degrade
// fallback either): it silently fell through as an unrecognized 'stmt' and
// the touched attribute went stale instead of being applied or degraded to
// unknown. Exactly the shape of the RPS example's `if (!p1Move.equals(p2Move))
// gamesPlayed++;`.
describe('applyActionCode — brace-less single-statement if', () => {
  it('applies the statement when the condition evaluates true', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '3' });
    const result = applyActionCode('if (count < 10) count++;', attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '4' });
  });

  it('does NOT apply the statement when the condition evaluates false (not misapplied)', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '10' });
    const result = applyActionCode('if (count < 10) count++;', attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '10' });
  });

  it('degrades (not silently no-ops) when the condition cannot be evaluated', () => {
    const result = applyActionCode('if (count < 10) count++;', attrIndex, unknownValues());
    expect(result.get('aCount')).toEqual({ kind: 'unknown' });
  });

  it('still applies a following unconditional line correctly (the if consumes only its own line)', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '10' });
    const result = applyActionCode('if (count < 10) count++;\ndirection = "EW";', attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '10' });
    expect(result.get('aName')).toEqual({ kind: 'known', value: 'EW' });
  });

  it('handles the exact RPS shape: a brace-less if guarding an increment via .equals()', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('p2Move', { id: 'aP2', type: 'STRING' });
    const values = unknownValues();
    values.set('aName',  { kind: 'known', value: 'ROCK' });     // p1Move-equivalent (aName/"direction")
    values.set('aP2',    { kind: 'known', value: 'SCISSORS' }); // p2Move-equivalent
    values.set('aCount', { kind: 'known', value: '0' });        // gamesPlayed-equivalent
    const result = applyActionCode('if (!direction.equals(p2Move)) count++;', twoStrings, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '1' });
  });

  // Regression: found via live testing on the actual RPS example, not caught
  // by the unit tests above — a brace-less if STILL silently no-op'd even
  // after the classifyLine/parseBlock fix, whenever the SAME action-code
  // block also contained a genuine else-if chain (with braces) somewhere
  // else. Because that chain is classified 'unsupported', applyActionCode
  // routes the WHOLE block through applyFlatDegraded — a separate, simpler
  // fallback that never got brace-less-if support, so it hit the exact
  // "if (cond) stmt" no-op bug the classifyLine fix was supposed to close.
  it('still applies a brace-less if correctly even when an unrelated else-if chain elsewhere forces the flat-degrade fallback', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('p2Move', { id: 'aP2', type: 'STRING' });
    const values = unknownValues();
    values.set('aName',  { kind: 'known', value: 'ROCK' });
    values.set('aP2',    { kind: 'known', value: 'PAPER' });
    values.set('aCount', { kind: 'known', value: '0' });
    const code = [
      'if (!direction.equals(p2Move)) count++;',
      'if (ready) {',
      '  price = 1;',
      '} else if (!ready) {',
      '  price = 2;',
      '}',
    ].join('\n');
    const result = applyActionCode(code, twoStrings, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '1' });
  });

  it('does not apply the brace-less statement (false condition) even inside the flat-degrade fallback', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('p2Move', { id: 'aP2', type: 'STRING' });
    const values = unknownValues();
    values.set('aName',  { kind: 'known', value: 'ROCK' });
    values.set('aP2',    { kind: 'known', value: 'ROCK' }); // equal -> condition false
    values.set('aCount', { kind: 'known', value: '0' });
    const code = [
      'if (!direction.equals(p2Move)) count++;',
      'if (ready) {',
      '  price = 1;',
      '} else if (!ready) {',
      '  price = 2;',
      '}',
    ].join('\n');
    const result = applyActionCode(code, twoStrings, values);
    expect(result.get('aCount')).toEqual({ kind: 'known', value: '0' });
  });

  it('degrades (not silently no-ops) a brace-less if inside the flat-degrade fallback when its condition is unresolvable', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '0' }); // seeded known, so a misapply-vs-degrade mixup is observable
    // "ready" (aFlag) is left unknown -> the guard is unresolvable.
    const code = [
      'if (ready) count++;',
      'if (ready) {',
      '  price = 1;',
      '} else if (!ready) {',
      '  price = 2;',
      '}',
    ].join('\n');
    const result = applyActionCode(code, attrIndex, values);
    expect(result.get('aCount')).toEqual({ kind: 'unknown' });
  });
});

describe('evaluateCondition — STRING/ENUM equality', () => {
  it('evaluates a known STRING attribute against a quoted literal', () => {
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('direction == "NS"', attrIndex, values)).toBe(true);
    expect(evaluateCondition('direction == "EW"', attrIndex, values)).toBe(false);
    expect(evaluateCondition('direction != "EW"', attrIndex, values)).toBe(true);
  });

  it('evaluates a known ENUM attribute against an enum literal', () => {
    const values = unknownValues();
    values.set('aColor', { kind: 'known', value: 'RED' });
    expect(evaluateCondition('lightColor == LightValue.RED', attrIndex, values)).toBe(true);
    expect(evaluateCondition('lightColor == LightValue.GREEN', attrIndex, values)).toBe(false);
  });

  it('still returns unknown when the STRING/ENUM value itself is not known', () => {
    const values = unknownValues();
    expect(evaluateCondition('direction == "NS"', attrIndex, values)).toBe('unknown');
  });

  it('still returns unknown when the RHS identifier is not tracked at all (not just any attribute-vs-attribute)', () => {
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('direction == otherAttr', attrIndex, values)).toBe('unknown');
  });

  // Regression / new capability: a genuine attribute-vs-attribute == / != now
  // resolves once BOTH sides are concretely known — the earlier "always
  // unknown" behavior was really about the values being unknown (e.g. both
  // derived from an incoming signal parameter with no static domain), not
  // about attribute-vs-attribute being inherently unsupported. Needed for
  // p1Move.equals(p2Move)-style guards to ever resolve once move values are
  // enum-bounded (see symbolicExecution.js's enum-parameter forking).
  it('resolves a genuine attribute-vs-attribute == / != once both sides are known', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('lastDirection', { id: 'aLastDir', type: 'STRING' });
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    values.set('aLastDir', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('direction == lastDirection', twoStrings, values)).toBe(true);
    expect(evaluateCondition('direction != lastDirection', twoStrings, values)).toBe(false);
    values.set('aLastDir', { kind: 'known', value: 'EW' });
    expect(evaluateCondition('direction == lastDirection', twoStrings, values)).toBe(false);
  });

  it('does NOT resolve attribute-vs-attribute for < <= > >= (only == / != ever compare two attributes)', () => {
    const twoInts = new Map(attrIndex);
    twoInts.set('otherCount', { id: 'aOtherCount', type: 'INT' });
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '5' });
    values.set('aOtherCount', { kind: 'known', value: '3' });
    expect(evaluateCondition('count > otherCount', twoInts, values)).toBe('unknown');
  });

  it('does not regress numeric/boolean comparisons', () => {
    const values = unknownValues();
    values.set('aCount', { kind: 'known', value: '5' });
    values.set('aFlag', { kind: 'known', value: 'true' });
    expect(evaluateCondition('count < 10', attrIndex, values)).toBe(true);
    expect(evaluateCondition('count >= 10', attrIndex, values)).toBe(false);
    expect(evaluateCondition('ready == true', attrIndex, values)).toBe(true);
  });
});

// The idiomatic (and for String, only correct) way to compare STRING/ENUM
// values in real Java action code — `.equals()`, not `==` — had no
// recognized grammar at all before this, forcing every such guard to
// 'unknown' regardless of whether the values were known.
describe('evaluateCondition — .equals() comparisons', () => {
  it('evaluates ident.equals("literal")', () => {
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('direction.equals("NS")', attrIndex, values)).toBe(true);
    expect(evaluateCondition('direction.equals("EW")', attrIndex, values)).toBe(false);
  });

  it('evaluates the negated form !ident.equals("literal")', () => {
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('!direction.equals("EW")', attrIndex, values)).toBe(true);
    expect(evaluateCondition('!direction.equals("NS")', attrIndex, values)).toBe(false);
  });

  it('evaluates ident.equals(enumLiteral) for an ENUM attribute', () => {
    const values = unknownValues();
    values.set('aColor', { kind: 'known', value: 'RED' });
    expect(evaluateCondition('lightColor.equals(LightValue.RED)', attrIndex, values)).toBe(true);
    expect(evaluateCondition('lightColor.equals(LightValue.GREEN)', attrIndex, values)).toBe(false);
  });

  it('resolves ident.equals(otherIdent) once both sides are known — the p1Move.equals(p2Move) shape', () => {
    const twoStrings = new Map(attrIndex);
    twoStrings.set('p2', { id: 'aP2', type: 'STRING' });
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'ROCK' });
    values.set('aP2', { kind: 'known', value: 'SCISSORS' });
    expect(evaluateCondition('direction.equals(p2)', twoStrings, values)).toBe(false);
    expect(evaluateCondition('!direction.equals(p2)', twoStrings, values)).toBe(true);
    values.set('aP2', { kind: 'known', value: 'ROCK' });
    expect(evaluateCondition('direction.equals(p2)', twoStrings, values)).toBe(true);
  });

  it('returns unknown when the receiver value is not known', () => {
    expect(evaluateCondition('direction.equals("NS")', attrIndex, unknownValues())).toBe('unknown');
  });

  it('returns unknown when the argument is not a literal or a currently-known tracked identifier', () => {
    const values = unknownValues();
    values.set('aName', { kind: 'known', value: 'NS' });
    expect(evaluateCondition('direction.equals(someLocal)', attrIndex, values)).toBe('unknown');
  });
});

describe('describeUnresolvedGuard', () => {
  it('flags an untracked identifier as a likely typo', () => {
    expect(describeUnresolvedGuard('countt > 5', attrIndex)).toMatch(/isn't a tracked attribute/);
    expect(describeUnresolvedGuard('flagg', attrIndex)).toMatch(/isn't a tracked attribute/);
  });

  it('flags an attribute-vs-attribute comparison distinctly from a typo', () => {
    expect(describeUnresolvedGuard('count > price', attrIndex)).toMatch(/other than a fixed value/);
  });

  it('gives a "not yet known" reason for a tracked attribute with an unknown value', () => {
    expect(describeUnresolvedGuard('count > 5', attrIndex)).toMatch(/isn't known for certain/);
  });

  it('flags an unsupported guard shape (e.g. a compound boolean expression)', () => {
    expect(describeUnresolvedGuard('ready && count', attrIndex)).toMatch(/not one of the supported guard forms/i);
  });
});
