import { describe, it, expect } from 'vitest';
import {
  getAllAttributes,
  typeDefault,
  convertSingle,
  convertAttrValue,
  getEnum,
  isEnumValueValid,
} from './modelHelpers.js';

// A tiny meta-model: Dog extends Animal.
// Inheritance relations are stored as source=child, target=parent.
const mm = {
  classes: [
    {
      id: 'Animal',
      name: 'Animal',
      attributes: [
        { id: 'name', name: 'name', type: 'STRING', lowerBound: 1, upperBound: 1 },
        { id: 'age',  name: 'age',  type: 'INT',    lowerBound: 0, upperBound: 1 },
      ],
    },
    {
      id: 'Dog',
      name: 'Dog',
      attributes: [
        { id: 'breed', name: 'breed', type: 'STRING', lowerBound: 1, upperBound: 1 },
      ],
    },
  ],
  relations: [
    { id: 'r1', kind: 'INHERITANCE', source: 'Dog', target: 'Animal' },
  ],
};

describe('getAllAttributes', () => {
  it('returns own attributes for a class with no parent', () => {
    const attrs = getAllAttributes('Animal', mm);
    expect(attrs.map((a) => a.id)).toEqual(['name', 'age']);
  });

  it('returns inherited attributes first, then own (inheritance-aware)', () => {
    const attrs = getAllAttributes('Dog', mm);
    expect(attrs.map((a) => a.id)).toEqual(['name', 'age', 'breed']);
  });

  it('returns [] for an unknown class id', () => {
    expect(getAllAttributes('Nope', mm)).toEqual([]);
  });

  it('lets a child attribute override a parent attribute with the same id', () => {
    const overriding = {
      classes: [
        { id: 'P', name: 'P', attributes: [{ id: 'x', name: 'x', type: 'STRING', lowerBound: 0, upperBound: 1 }] },
        { id: 'C', name: 'C', attributes: [{ id: 'x', name: 'x', type: 'INT',    lowerBound: 0, upperBound: 1 }] },
      ],
      relations: [{ id: 'r', kind: 'INHERITANCE', source: 'C', target: 'P' }],
    };
    const attrs = getAllAttributes('C', overriding);
    // Deduped by id — the child's own definition wins.
    expect(attrs).toHaveLength(1);
    expect(attrs[0].type).toBe('INT');
  });
});

describe('typeDefault', () => {
  it('uses the type zero-value when no meta default is set', () => {
    expect(typeDefault('INT')).toBe('0');
    expect(typeDefault('DOUBLE')).toBe('0');
    expect(typeDefault('BOOLEAN')).toBe('false');
    expect(typeDefault('STRING')).toBe('');
  });

  it('prefers the meta-model defaultValue when present', () => {
    expect(typeDefault('INT', { defaultValue: '42' })).toBe('42');
  });

  it('ignores a blank meta default and falls back to the type zero', () => {
    expect(typeDefault('INT', { defaultValue: '   ' })).toBe('0');
  });
});

describe('convertSingle', () => {
  it('leaves empty values empty regardless of types', () => {
    expect(convertSingle('', 'STRING', 'INT')).toBe('');
    expect(convertSingle('   ', 'BOOLEAN', 'INT')).toBe('');
  });

  it('is a no-op when the types are identical', () => {
    expect(convertSingle('hello', 'STRING', 'STRING')).toBe('hello');
    expect(convertSingle('7', 'INT', 'INT')).toBe('7');
  });

  it('converts anything to STRING trivially', () => {
    expect(convertSingle('true', 'BOOLEAN', 'STRING')).toBe('true');
    expect(convertSingle('3.5', 'DOUBLE', 'STRING')).toBe('3.5');
  });

  it('BOOLEAN -> INT/DOUBLE maps true/false to 1/0', () => {
    expect(convertSingle('true',  'BOOLEAN', 'INT')).toBe('1');
    expect(convertSingle('false', 'BOOLEAN', 'INT')).toBe('0');
    expect(convertSingle('true',  'BOOLEAN', 'DOUBLE')).toBe('1');
  });

  it('INT/DOUBLE -> BOOLEAN maps zero to false, non-zero to true', () => {
    expect(convertSingle('0',    'INT',    'BOOLEAN')).toBe('false');
    expect(convertSingle('5',    'INT',    'BOOLEAN')).toBe('true');
    expect(convertSingle('0.0',  'DOUBLE', 'BOOLEAN')).toBe('false');
    expect(convertSingle('-2.5', 'DOUBLE', 'BOOLEAN')).toBe('true');
  });

  it('DOUBLE -> INT truncates', () => {
    expect(convertSingle('3.9', 'DOUBLE', 'INT')).toBe('3');
    expect(convertSingle('-1.2', 'DOUBLE', 'INT')).toBe('-1');
  });

  it('STRING -> INT parses valid input', () => {
    expect(convertSingle('42', 'STRING', 'INT')).toBe('42');
  });

  it('STRING -> INT falls back to the default on unparseable input', () => {
    expect(convertSingle('abc', 'STRING', 'INT')).toBe('0');
    expect(convertSingle('abc', 'STRING', 'INT', { defaultValue: '9' })).toBe('9');
  });

  it('STRING -> DOUBLE parses valid input, else default', () => {
    expect(convertSingle('3.14', 'STRING', 'DOUBLE')).toBe('3.14');
    expect(convertSingle('nope', 'STRING', 'DOUBLE')).toBe('0');
  });

  it('STRING -> BOOLEAN accepts true/false/1/0, else default', () => {
    expect(convertSingle('true',  'STRING', 'BOOLEAN')).toBe('true');
    expect(convertSingle('1',     'STRING', 'BOOLEAN')).toBe('true');
    expect(convertSingle('false', 'STRING', 'BOOLEAN')).toBe('false');
    expect(convertSingle('0',     'STRING', 'BOOLEAN')).toBe('false');
    expect(convertSingle('maybe', 'STRING', 'BOOLEAN')).toBe('false'); // type default
  });
});

describe('getEnum / isEnumValueValid', () => {
  const mmEnum = {
    classes: [],
    relations: [],
    enumerations: [{ id: 'e1', name: 'Color', literals: ['RED', 'GREEN', 'BLUE'] }],
  };

  it('resolves an enum by id', () => {
    expect(getEnum('e1', mmEnum).name).toBe('Color');
  });

  it('returns null for an unknown enum id (or a model with no enums)', () => {
    expect(getEnum('nope', mmEnum)).toBeNull();
    expect(getEnum('e1', { classes: [], relations: [] })).toBeNull();
  });

  it('accepts a value that is one of the literals', () => {
    expect(isEnumValueValid('GREEN', getEnum('e1', mmEnum))).toBe(true);
  });

  it('rejects a value that is not a literal', () => {
    expect(isEnumValueValid('PURPLE', getEnum('e1', mmEnum))).toBe(false);
  });

  it('treats a missing enum definition as invalid', () => {
    expect(isEnumValueValid('RED', null)).toBe(false);
  });
});

describe('convertAttrValue', () => {
  it('returns the value untouched when types match', () => {
    const arr = ['a', 'b'];
    expect(convertAttrValue(arr, 'STRING', 'STRING')).toBe(arr);
  });

  it('converts each element of an array', () => {
    expect(convertAttrValue(['true', 'false'], 'BOOLEAN', 'INT')).toEqual(['1', '0']);
  });

  it('converts a single scalar value', () => {
    expect(convertAttrValue('true', 'BOOLEAN', 'INT')).toBe('1');
  });
});
