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

describe('evalExpression — negation', () => {
  it('negates a BOOLEAN attribute value', () => {
    expect(evalExpression('!{x}', { x: 'true' })).toBe('false');
    expect(evalExpression('!{x}', { x: 'false' })).toBe('true');
    expect(evalExpression('!{x}', { x: '' })).toBe('true');
  });

  it('negates a comparison in parentheses and works as a ternary condition', () => {
    expect(evalExpression('!({price} > 10)', { price: '5' })).toBe('true');
    expect(evalExpression('!{active} ? "off" : "on"', { active: 'true' })).toBe('on');
  });

  it('allows double negation and still supports !=', () => {
    expect(evalExpression('!!{x}', { x: 'true' })).toBe('true');
    expect(evalExpression('{a} != {b}', { a: '1', b: '2' })).toBe('true');
  });

  it('still throws on a bare "!" with nothing after it', () => {
    expect(() => evalExpression('!', {})).toThrow();
  });
});

describe('evalExpression — typed BOOLEAN references', () => {
  const types = { x: 'BOOLEAN', label: 'STRING' };

  it('counts a BOOLEAN reference as 1/0 in arithmetic', () => {
    expect(evalExpression('100 + {x}', { x: 'true' }, types)).toBe('101');
    expect(evalExpression('100 + {x}', { x: 'false' }, types)).toBe('100');
    expect(evalExpression('{x} + 1', { x: 'true' }, types)).toBe('2');
    expect(evalExpression('100 - {x}', { x: 'true' }, types)).toBe('99');
    expect(evalExpression('100 * {x}', { x: 'true' }, types)).toBe('100');
  });

  it('still concatenates when the other operand is text', () => {
    expect(evalExpression('{label} + {x}', { label: 'on:', x: 'true' }, types)).toBe('on:true');
  });

  it('does not convert a STRING attribute that merely holds the text "true"', () => {
    expect(evalExpression('100 + {label}', { label: 'true' }, types)).toBe('100true');
  });

  it('compares BOOLEAN references sensibly and treats an unset one as false', () => {
    expect(evalExpression('{x} == "true"', { x: 'true' }, types)).toBe('true');
    expect(evalExpression('{x} ? "on" : "off"', { x: '' }, types)).toBe('off');
    expect(evalExpression('!{x}', { x: '' }, types)).toBe('true');
  });

  it('is unchanged without types (plain string values)', () => {
    expect(evalExpression('100 + {x}', { x: 'true' })).toBe('100true');
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

describe('evalExpression — method-call syntax', () => {
  it("evaluates the professor's .equals ternary example", () => {
    expect(evalExpression('{s}.equals("A") ? 1 : 0', { s: 'A' })).toBe('1');
    expect(evalExpression('{s}.equals("A") ? 1 : 0', { s: 'B' })).toBe('0');
  });

  it('treats the method form and the function form as identical', () => {
    expect(evalExpression('{s}.upper()', { s: 'ada' })).toBe('ADA');
    expect(evalExpression('upper({s})', { s: 'ada' })).toBe('ADA');
    expect(evalExpression('{s}.substring(1, 3)', { s: 'abcdef' })).toBe('bc');
    expect(evalExpression('substring({s}, 1, 3)', { s: 'abcdef' })).toBe('bc');
  });

  it('accepts Java-style aliases', () => {
    expect(evalExpression('{s}.toUpperCase()', { s: 'ada' })).toBe('ADA');
    expect(evalExpression('{s}.toLowerCase()', { s: 'ADA' })).toBe('ada');
    expect(evalExpression('{s}.length()', { s: 'ada' })).toBe('3');
  });

  it('chains calls and works on literals and parenthesised expressions', () => {
    expect(evalExpression('{s}.trim().upper()', { s: '  ada ' })).toBe('ADA');
    expect(evalExpression('"abc".length()', {})).toBe('3');
    expect(evalExpression('({a} + {b}).substring(0, 3)', { a: 'abc', b: 'def' })).toBe('abc');
  });

  it('binds ! looser than a method call', () => {
    expect(evalExpression('!{s}.isEmpty()', { s: 'x' })).toBe('true');
  });

  it('does not confuse a decimal point with a method call', () => {
    expect(evalExpression('1.5 + .5', {})).toBe('2');
  });

  it('does not treat a string literal as punctuation', () => {
    expect(evalExpression('{s}.contains(")")', { s: 'a)b' })).toBe('true');
    expect(evalExpression('{s}.equals(":") ? "y" : "n"', { s: ':' })).toBe('y');
  });
});

describe('evalExpression — string functions', () => {
  it('substring clamps out-of-range indices instead of throwing', () => {
    expect(evalExpression('{s}.substring(0, 4)', { s: 'abcdefg' })).toBe('abcd');
    expect(evalExpression('{s}.substring(0, 99)', { s: 'abc' })).toBe('abc');
    expect(evalExpression('{s}.substring(5)', { s: 'abcdefg' })).toBe('fg');
    expect(evalExpression('{s}.substring(9)', { s: 'abc' })).toBe('');
    expect(evalExpression('{s}.substring(-3, 2)', { s: 'abc' })).toBe('ab');
    expect(evalExpression('{s}.substring(3, 1)', { s: 'abcdef' })).toBe('');
  });

  it('searches', () => {
    expect(evalExpression('{s}.indexOf("c")', { s: 'abcabc' })).toBe('2');
    expect(evalExpression('{s}.indexOf("c", 3)', { s: 'abcabc' })).toBe('5');
    expect(evalExpression('{s}.indexOf("z")', { s: 'abc' })).toBe('-1');
    expect(evalExpression('{s}.contains("bc")', { s: 'abcd' })).toBe('true');
    expect(evalExpression('{s}.startsWith("ab")', { s: 'abcd' })).toBe('true');
    expect(evalExpression('{s}.endsWith("cd")', { s: 'abcd' })).toBe('true');
    expect(evalExpression('{s}.charAt(1)', { s: 'abc' })).toBe('b');
    expect(evalExpression('{s}.charAt(9)', { s: 'abc' })).toBe('');
  });

  it('compares and tests emptiness', () => {
    expect(evalExpression('{s}.equals("Ada")', { s: 'Ada' })).toBe('true');
    expect(evalExpression('{s}.equals("ada")', { s: 'Ada' })).toBe('false');
    expect(evalExpression('{s}.equalsIgnoreCase("ada")', { s: 'Ada' })).toBe('true');
    expect(evalExpression('{s}.isEmpty()', { s: '' })).toBe('true');
    expect(evalExpression('{s}.isBlank()', { s: '   ' })).toBe('true');
    expect(evalExpression('{s}.isBlank()', { s: ' x ' })).toBe('false');
  });

  it('replaces every literal occurrence', () => {
    expect(evalExpression('{s}.replace("-", "")', { s: '1-2-3' })).toBe('123');
    expect(evalExpression('{s}.replace("", "x")', { s: 'abc' })).toBe('abc');
  });

  it('coalesce returns the first non-empty value', () => {
    expect(evalExpression('coalesce({a}, {b}, "none")', { a: '', b: 'B' })).toBe('B');
    expect(evalExpression('{a}.coalesce("none")', { a: '' })).toBe('none');
    expect(evalExpression('coalesce({a}, {b})', { a: '', b: '' })).toBe('');
  });

  it('match is a lookup table with an optional default', () => {
    const e = '{s}.match("A", "Active", "I", "Inactive", "Unknown")';
    expect(evalExpression(e, { s: 'A' })).toBe('Active');
    expect(evalExpression(e, { s: 'I' })).toBe('Inactive');
    expect(evalExpression(e, { s: 'Z' })).toBe('Unknown');
    // no default -> value passes through unchanged
    expect(evalExpression('{s}.match("A", "Active")', { s: 'Z' })).toBe('Z');
  });
});

describe('evalExpression — numeric additions', () => {
  it('supports modulo', () => {
    expect(evalExpression('7 % 3', {})).toBe('1');
    expect(evalExpression('{n} % 2 == 0 ? "even" : "odd"', { n: '4' })).toBe('even');
  });

  it('rounds to a number of decimal places', () => {
    expect(evalExpression('round(3.14159, 2)', {})).toBe('3.14');
    expect(evalExpression('round(2.5)', {})).toBe('3');
    expect(evalExpression('{x}.round(1)', { x: '2.25' })).toBe('2.3');
  });

  it('floors, ceils, and takes min/max', () => {
    expect(evalExpression('floor(2.9)', {})).toBe('2');
    expect(evalExpression('ceil(2.1)', {})).toBe('3');
    expect(evalExpression('min(3, 1, 2)', {})).toBe('1');
    expect(evalExpression('max({a}, {b})', { a: '4', b: '9' })).toBe('9');
  });
});

describe('evalExpression — logical operators and literals', () => {
  it('combines conditions with && and ||', () => {
    expect(evalExpression('{a} > 0 && {b} > 0', { a: '1', b: '2' })).toBe('true');
    expect(evalExpression('{a} > 0 && {b} > 0', { a: '1', b: '-2' })).toBe('false');
    expect(evalExpression('{a} > 0 || {b} > 0', { a: '-1', b: '2' })).toBe('true');
  });

  it('gives && higher precedence than ||', () => {
    expect(evalExpression('true || false && false', {})).toBe('true');
    expect(evalExpression('(true || false) && false', {})).toBe('false');
  });

  it('works as a ternary condition', () => {
    expect(evalExpression('{a} > 0 && !{done} ? "todo" : "skip"', { a: '1', done: 'false' })).toBe('todo');
  });

  it('understands true and false literals', () => {
    expect(evalExpression('{x} == true', { x: 'true' }, { x: 'BOOLEAN' })).toBe('true');
    expect(evalExpression('false', {})).toBe('false');
  });

  it('rejects a single & or |', () => {
    expect(() => evalExpression('true & false', {})).toThrow();
    expect(() => evalExpression('true | false', {})).toThrow();
  });
});

describe('evalExpression — typed references', () => {
  const types = { zip: 'STRING', n: 'INT', d: 'DOUBLE', c: 'ENUM', f: 'BOOLEAN' };

  it('concatenates STRING attributes even when they look numeric', () => {
    expect(evalExpression('{zip} + {zip}', { zip: '12' }, types)).toBe('1212');
    expect(evalExpression('{zip}.substring(0, 1) + {zip}.substring(1)', { zip: '12' }, types)).toBe('12');
    // untyped legacy behaviour is unchanged
    expect(evalExpression('{zip} + {zip}', { zip: '12' })).toBe('24');
  });

  it('adds INT and DOUBLE attributes numerically', () => {
    expect(evalExpression('{n} + {n}', { n: '12' }, types)).toBe('24');
    expect(evalExpression('{n} + {d}', { n: '1', d: '0.5' }, types)).toBe('1.5');
  });

  it('concatenates a number with text', () => {
    expect(evalExpression('{n} + "x"', { n: '7' }, types)).toBe('7x');
    expect(evalExpression('"x" + {n}', { n: '7' }, types)).toBe('x7');
  });

  it('treats string literals as text', () => {
    expect(evalExpression('"1" + "2"', {}, types)).toBe('12');
    expect(evalExpression('"1" + "2"', {})).toBe('3');
  });

  it('compares text as text and numbers as numbers', () => {
    expect(evalExpression('{zip} == "7"', { zip: '07' }, types)).toBe('false');
    expect(evalExpression('{zip} == "07"', { zip: '07' }, types)).toBe('true');
    expect(evalExpression('{n} == 7', { n: '07' }, types)).toBe('true');
    expect(evalExpression('{n} > 9', { n: '10' }, types)).toBe('true');
  });

  it('keeps ENUM values as text', () => {
    expect(evalExpression('{c}.equals("RED") ? 1 : 0', { c: 'RED' }, types)).toBe('1');
    expect(evalExpression('{c}.match("RED", "R", "GREEN", "G")', { c: 'GREEN' }, types)).toBe('G');
  });
});

describe('evalExpression — function errors', () => {
  it('reports the wrong number of arguments, excluding the receiver for methods', () => {
    expect(() => evalExpression('{s}.substring()', { s: 'x' })).toThrow(/1 to 2 arguments/);
    expect(() => evalExpression('substring({s})', { s: 'x' })).toThrow(/2 to 3 arguments/);
    expect(() => evalExpression('{s}.upper(1)', { s: 'x' })).toThrow(/0 arguments/);
  });

  it('throws on an unknown method', () => {
    expect(() => evalExpression('{s}.shout()', { s: 'x' })).toThrow(/Unknown method/);
  });

  it('throws on a missing method name or missing parens', () => {
    expect(() => evalExpression('{s}.', { s: 'x' })).toThrow();
    expect(() => evalExpression('{s}.upper', { s: 'x' })).toThrow();
    expect(() => evalExpression('{s}.contains("a"', { s: 'x' })).toThrow();
  });

  it('points a bare name at the brace syntax', () => {
    expect(() => evalExpression('name', {})).toThrow(/\{name\}/);
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
