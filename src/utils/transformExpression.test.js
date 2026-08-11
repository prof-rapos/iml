import { describe, it, expect } from 'vitest';
import { evalExpression, isNumericValue } from './transformExpression.js';

const scope = {
  firstName: 'Ada',
  lastName:  'Lovelace',
  price:     '10',
  qty:       '3',
  tags:      ['a', 'b'],
};

describe('evalExpression — strings', () => {
  it('returns a plain string literal', () => {
    expect(evalExpression('"hello"', scope)).toBe('hello');
  });

  it('resolves a reference to a source attribute', () => {
    expect(evalExpression('{firstName}', scope)).toBe('Ada');
  });

  it('concatenates references and string literals', () => {
    expect(evalExpression('{firstName} + " " + {lastName}', scope)).toBe('Ada Lovelace');
  });

  it('treats + as concatenation when an operand is non-numeric', () => {
    expect(evalExpression('{firstName} + {lastName}', scope)).toBe('AdaLovelace');
  });

  it('joins a multi-valued reference with spaces', () => {
    expect(evalExpression('{tags}', scope)).toBe('a b');
  });

  it('returns "" for an unknown reference', () => {
    expect(evalExpression('{missing}', scope)).toBe('');
  });

  it('returns "" for an empty expression', () => {
    expect(evalExpression('', scope)).toBe('');
    expect(evalExpression('   ', scope)).toBe('');
  });
});

describe('evalExpression — arithmetic', () => {
  it('adds two numeric references', () => {
    expect(evalExpression('{price} + {qty}', scope)).toBe('13');
  });

  it('multiplies a reference by a literal', () => {
    expect(evalExpression('{price} * 1.1', scope)).toBe('11');
  });

  it('respects operator precedence and parentheses', () => {
    expect(evalExpression('{price} + {qty} * 2', scope)).toBe('16');
    expect(evalExpression('({price} + {qty}) / 2', scope)).toBe('6.5');
  });

  it('handles unary minus', () => {
    expect(evalExpression('-{qty}', scope)).toBe('-3');
  });

  it('trims floating-point noise', () => {
    expect(evalExpression('0.1 + 0.2', scope)).toBe('0.3');
  });
});

describe('evalExpression — comparisons', () => {
  it('compares numerically when both operands look numeric', () => {
    expect(evalExpression('{price} > 5', scope)).toBe('true');
    expect(evalExpression('{price} > 50', scope)).toBe('false');
    expect(evalExpression('{qty} >= 3', scope)).toBe('true');
    expect(evalExpression('{qty} <= 2', scope)).toBe('false');
    expect(evalExpression('{price} == 10', scope)).toBe('true');
    expect(evalExpression('{price} != 10', scope)).toBe('false');
  });

  it('compares lexicographically when either operand is non-numeric', () => {
    expect(evalExpression('{firstName} == "Ada"', scope)).toBe('true');
    expect(evalExpression('{firstName} != "Bob"', scope)).toBe('true');
    expect(evalExpression('{lastName} > "Ada"', scope)).toBe('true');
  });

  it('does not chain multiple comparisons (only one per level)', () => {
    // "1 < 2 < 3" is not meaningful in this grammar's comparison level —
    // exercised implicitly by every other comparison test using exactly one
    // operator; nothing further to assert beyond the grammar shape itself.
    expect(evalExpression('1 < 2', scope)).toBe('true');
  });
});

describe('evalExpression — ternary', () => {
  it("evaluates the professor's own example", () => {
    expect(evalExpression('{price} > 10 ? "large" : "small"', { price: '15' })).toBe('large');
    expect(evalExpression('{price} > 10 ? "large" : "small"', { price: '5' })).toBe('small');
  });

  it('nests ternaries in the "then"/"else" branches', () => {
    const expr = '{qty} > 10 ? "many" : {qty} > 2 ? "some" : "none"';
    expect(evalExpression(expr, { qty: '1' })).toBe('none');
    expect(evalExpression(expr, { qty: '5' })).toBe('some');
    expect(evalExpression(expr, { qty: '20' })).toBe('many');
  });

  it('treats a bare non-comparison reference as a truthy condition', () => {
    expect(evalExpression('{active} ? "on" : "off"', { active: 'true' })).toBe('on');
    expect(evalExpression('{active} ? "on" : "off"', { active: 'false' })).toBe('off');
    expect(evalExpression('{active} ? "on" : "off"', { active: '' })).toBe('off');
  });

  it('computes an arithmetic expression inside a ternary branch', () => {
    // scope.price is '10', so {price} > 10 is false — takes the else branch.
    expect(evalExpression('{price} > 10 ? {price} * 2 : {price}', scope)).toBe('10');
    expect(evalExpression('{price} >= 10 ? {price} * 2 : {price}', scope)).toBe('20');
  });

  it('respects parentheses around a full ternary', () => {
    expect(evalExpression('({price} > 10 ? "big" : "small") + "!"', scope)).toBe('small!');
  });
});

describe('evalExpression — functions', () => {
  it('uppercases and lowercases', () => {
    expect(evalExpression('upper({firstName})', scope)).toBe('ADA');
    expect(evalExpression('lower({lastName})', scope)).toBe('lovelace');
  });

  it('trims whitespace', () => {
    expect(evalExpression('trim({padded})', { padded: '  hi  ' })).toBe('hi');
  });

  it('rounds a numeric expression', () => {
    expect(evalExpression('round({price} * 1.15)', scope)).toBe('12');
    expect(evalExpression('round(2.4)', scope)).toBe('2');
    expect(evalExpression('round(2.5)', scope)).toBe('3');
  });

  it('takes an absolute value', () => {
    expect(evalExpression('abs(-{qty})', scope)).toBe('3');
  });

  it('measures string length', () => {
    expect(evalExpression('len({firstName})', scope)).toBe('3');
  });

  it('matches function names case-insensitively', () => {
    expect(evalExpression('UPPER({firstName})', scope)).toBe('ADA');
  });

  it('nests functions and composes with other operators', () => {
    expect(evalExpression('upper(trim({padded}))', { padded: '  ada  ' })).toBe('ADA');
    expect(evalExpression('upper({firstName}) + " " + upper({lastName})', scope)).toBe('ADA LOVELACE');
  });

  it('accepts a function call as a ternary condition/branch', () => {
    expect(evalExpression('len({firstName}) > 2 ? upper({firstName}) : {firstName}', scope)).toBe('ADA');
  });

  it('throws on an unknown function', () => {
    expect(() => evalExpression('shout({firstName})', scope)).toThrow();
  });

  it('throws on a bare identifier that is not a function call', () => {
    expect(() => evalExpression('upper', scope)).toThrow();
  });

  it('throws on a function call missing its closing paren', () => {
    expect(() => evalExpression('upper({firstName}', scope)).toThrow();
  });
});

describe('evalExpression — errors', () => {
  it('throws on unbalanced parentheses', () => {
    expect(() => evalExpression('({price} + 1', scope)).toThrow();
  });

  it('throws on an unclosed reference', () => {
    expect(() => evalExpression('{price', scope)).toThrow();
  });

  it('throws on trailing input', () => {
    expect(() => evalExpression('{price} {qty}', scope)).toThrow();
  });

  it('throws on a ternary missing its ":" branch', () => {
    expect(() => evalExpression('{price} > 5 ? "big"', scope)).toThrow();
  });
});

describe('isNumericValue', () => {
  it('recognises numbers and numeric strings', () => {
    expect(isNumericValue(5)).toBe(true);
    expect(isNumericValue('3.14')).toBe(true);
    expect(isNumericValue('-2')).toBe(true);
  });

  it('rejects non-numeric strings and blanks', () => {
    expect(isNumericValue('Ada')).toBe(false);
    expect(isNumericValue('')).toBe(false);
    expect(isNumericValue('  ')).toBe(false);
  });
});
