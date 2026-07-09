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
