import { describe, it, expect } from 'vitest';
import { useTransformStore } from './transformStore.js';

// A source model whose class has three enum attributes (all typed by one "Size"
// enum) plus a plain string, and a target whose same-named attributes reference
// enums that variously match or mismatch.
const source = {
  metaModel: {
    name: 'Src',
    enumerations: [{ id: 'se', name: 'Size', literals: ['S', 'M', 'L'] }],
    classes: [{
      id: 'sc', name: 'SC', attributes: [
        { id: 's1', name: 'sizeMatch', type: 'ENUM', enumId: 'se', lowerBound: 0, upperBound: 1 },
        { id: 's2', name: 'sizeDiff',  type: 'ENUM', enumId: 'se', lowerBound: 0, upperBound: 1 },
        { id: 's3', name: 'sizeName',  type: 'ENUM', enumId: 'se', lowerBound: 0, upperBound: 1 },
        { id: 's4', name: 'plain',     type: 'STRING', lowerBound: 0, upperBound: 1 },
      ],
    }],
    relations: [],
  },
  instanceModels: [],
  layouts: {},
};

const target = {
  metaModel: {
    name: 'Tgt',
    enumerations: [
      { id: 'te1', name: 'Size',  literals: ['S', 'M', 'L'] }, // same name + literals
      { id: 'te2', name: 'Size',  literals: ['S', 'M'] },      // same name, different literals
      { id: 'te3', name: 'Grade', literals: ['S', 'M', 'L'] }, // different name, same literals
    ],
    classes: [{
      id: 'tc', name: 'TC', attributes: [
        { id: 't1', name: 'sizeMatch', type: 'ENUM', enumId: 'te1', lowerBound: 0, upperBound: 1 },
        { id: 't2', name: 'sizeDiff',  type: 'ENUM', enumId: 'te2', lowerBound: 0, upperBound: 1 },
        { id: 't3', name: 'sizeName',  type: 'ENUM', enumId: 'te3', lowerBound: 0, upperBound: 1 },
        { id: 't4', name: 'plain',     type: 'STRING', lowerBound: 0, upperBound: 1 },
      ],
    }],
    relations: [],
  },
};

describe('transformStore.addRule — enum-aware auto-mapping', () => {
  it('only auto-maps enum attributes when the enums correspond', () => {
    const store = useTransformStore;
    store.getState().loadSource(source);
    store.getState().loadTarget(target);
    store.getState().addRule('sc', 'tc');

    const rule = store.getState().rules[0];
    const byTarget = (id) => rule.attributeMappings.find((m) => m.targetAttrId === id);

    // Same name + same literals → auto-mapped direct.
    expect(byTarget('t1').type).toBe('direct');
    expect(byTarget('t1').sourceAttrId).toBe('s1');

    // Same enum name but different literals → left unmapped.
    expect(byTarget('t2').type).toBe('omit');

    // Different enum name (even with same literals) → left unmapped.
    expect(byTarget('t3').type).toBe('omit');

    // Non-enum attributes still auto-map by name + type.
    expect(byTarget('t4').type).toBe('direct');
    expect(byTarget('t4').sourceAttrId).toBe('s4');
  });
});
