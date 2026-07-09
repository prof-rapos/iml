import { describe, it, expect } from 'vitest';
import { runTransform } from './runTransform.js';

// ── Fixture builders ──────────────────────────────────────────────────────────
// Keep each test's model as small as the behaviour it exercises.

function srcModel({ attr, value, layouts = {} }) {
  return {
    metaModel: {
      classes: [{ id: 'S', name: 'S', attributes: [attr] }],
      relations: [],
    },
    instanceModels: [{
      id: 'im1',
      kind: 'instancemodel',
      name: 'M',
      objects: [{ id: 'o1', classId: 'S', name: 'obj1', attributeValues: { [attr.id]: value } }],
      links: [],
    }],
    layouts,
  };
}

function tgtModel(attr) {
  return {
    metaModel: {
      classes: [{ id: 'T', name: 'T', attributes: [attr] }],
      relations: [],
    },
  };
}

const directRule = (sourceAttrId, targetAttrId) => [{
  sourceClassId: 'S',
  targetClassId: 'T',
  attributeMappings: [{ type: 'direct', sourceAttrId, targetAttrId }],
  relationMappings: [],
}];

describe('runTransform — type + multiplicity coercion', () => {
  // Regression: z: BOOLEAN [1..2] mapped to r: INT [1..1] used to produce
  // ["true","false"] instead of "1". multi -> single must convert AND take the first.
  it('coerces multi-valued BOOLEAN source into single INT target (takes first, converts)', () => {
    const source = srcModel({
      attr: { id: 'z', name: 'z', type: 'BOOLEAN', lowerBound: 1, upperBound: 2 },
      value: ['true', 'false'],
    });
    const target = tgtModel({ id: 'r', name: 'r', type: 'INT', lowerBound: 1, upperBound: 1 });

    const result = runTransform(source, target, directRule('z', 'r'));
    const obj = result.instanceModels[0].objects[0];

    expect(obj.attributeValues.r).toBe('1');
  });

  it('wraps a single source value into an array for a multi-valued target', () => {
    const source = srcModel({
      attr: { id: 'n', name: 'n', type: 'INT', lowerBound: 1, upperBound: 1 },
      value: '5',
    });
    const target = tgtModel({ id: 'm', name: 'm', type: 'INT', lowerBound: 0, upperBound: -1 });

    const result = runTransform(source, target, directRule('n', 'm'));
    expect(result.instanceModels[0].objects[0].attributeValues.m).toEqual(['5']);
  });

  it('converts each element for a multi -> multi mapping', () => {
    const source = srcModel({
      attr: { id: 'flags', name: 'flags', type: 'BOOLEAN', lowerBound: 0, upperBound: -1 },
      value: ['true', 'false', 'true'],
    });
    const target = tgtModel({ id: 'nums', name: 'nums', type: 'INT', lowerBound: 0, upperBound: -1 });

    const result = runTransform(source, target, directRule('flags', 'nums'));
    expect(result.instanceModels[0].objects[0].attributeValues.nums).toEqual(['1', '0', '1']);
  });

  it('evaluates an expression mapping over source attributes (string concat)', () => {
    const source = {
      metaModel: {
        classes: [{ id: 'S', name: 'S', attributes: [
          { id: 'f', name: 'first', type: 'STRING', lowerBound: 0, upperBound: 1 },
          { id: 'l', name: 'last',  type: 'STRING', lowerBound: 0, upperBound: 1 },
        ] }],
        relations: [],
      },
      instanceModels: [{
        id: 'im1', kind: 'instancemodel', name: 'M',
        objects: [{ id: 'o1', classId: 'S', name: 'obj1', attributeValues: { f: 'Ada', l: 'Lovelace' } }],
        links: [],
      }],
      layouts: {},
    };
    const target = tgtModel({ id: 'full', name: 'full', type: 'STRING', lowerBound: 0, upperBound: 1 });
    const rules = [{
      sourceClassId: 'S',
      targetClassId: 'T',
      attributeMappings: [{ type: 'expression', targetAttrId: 'full', expression: '{first} + " " + {last}' }],
      relationMappings: [],
    }];

    const result = runTransform(source, target, rules);
    expect(result.instanceModels[0].objects[0].attributeValues.full).toBe('Ada Lovelace');
  });

  it('coerces a numeric expression result to the target INT type (truncates)', () => {
    const source = {
      metaModel: {
        classes: [{ id: 'S', name: 'S', attributes: [
          { id: 'p', name: 'price', type: 'DOUBLE', lowerBound: 0, upperBound: 1 },
        ] }],
        relations: [],
      },
      instanceModels: [{
        id: 'im1', kind: 'instancemodel', name: 'M',
        objects: [{ id: 'o1', classId: 'S', name: 'obj1', attributeValues: { p: '10' } }],
        links: [],
      }],
      layouts: {},
    };
    const target = tgtModel({ id: 'n', name: 'n', type: 'INT', lowerBound: 0, upperBound: 1 });
    const rules = [{
      sourceClassId: 'S',
      targetClassId: 'T',
      attributeMappings: [{ type: 'expression', targetAttrId: 'n', expression: '{price} * 1.15' }],
      relationMappings: [],
    }];

    // 10 * 1.15 = 11.5 → INT truncates to "11"
    const result = runTransform(source, target, rules);
    expect(result.instanceModels[0].objects[0].attributeValues.n).toBe('11');
  });

  it('falls back to an empty value for a malformed expression', () => {
    const source = srcModel({
      attr: { id: 'x', name: 'x', type: 'STRING', lowerBound: 0, upperBound: 1 },
      value: 'v',
    });
    const target = tgtModel({ id: 'r', name: 'r', type: 'STRING', lowerBound: 0, upperBound: 1 });
    const rules = [{
      sourceClassId: 'S',
      targetClassId: 'T',
      attributeMappings: [{ type: 'expression', targetAttrId: 'r', expression: '{x' }],
      relationMappings: [],
    }];

    const result = runTransform(source, target, rules);
    expect(result.instanceModels[0].objects[0].attributeValues.r).toBe('');
  });

  it('respects target multiplicity for constant mappings', () => {
    const source = srcModel({
      attr: { id: 'x', name: 'x', type: 'STRING', lowerBound: 0, upperBound: 1 },
      value: 'ignored',
    });
    const target = tgtModel({ id: 'tags', name: 'tags', type: 'STRING', lowerBound: 0, upperBound: -1 });

    const rules = [{
      sourceClassId: 'S',
      targetClassId: 'T',
      attributeMappings: [{ type: 'constant', targetAttrId: 'tags', value: 'K' }],
      relationMappings: [],
    }];

    const result = runTransform(source, target, rules);
    expect(result.instanceModels[0].objects[0].attributeValues.tags).toEqual(['K']);
  });
});

describe('runTransform — layout preservation', () => {
  it('carries source class positions onto target class ids via the rule', () => {
    const source = srcModel({
      attr: { id: 'z', name: 'z', type: 'STRING', lowerBound: 0, upperBound: 1 },
      value: 'v',
      layouts: { mm: { S: { x: 10, y: 20 } }, 'im-im1': { o1: { x: 5, y: 6 } } },
    });
    const target = tgtModel({ id: 'r', name: 'r', type: 'STRING', lowerBound: 0, upperBound: 1 });

    const result = runTransform(source, target, directRule('z', 'r'));

    // Meta-model layout: S's position now lives under T.
    expect(result.layouts.mm.T).toEqual({ x: 10, y: 20 });

    // Instance layout: o1's position now lives under the generated target object id.
    const newIM  = result.instanceModels[0];
    const newObj = newIM.objects[0];
    expect(result.layouts[`im-${newIM.id}`][newObj.id]).toEqual({ x: 5, y: 6 });
  });
});

describe('runTransform — links', () => {
  it('rewrites link endpoints to the new object ids and preserves handles', () => {
    const source = {
      metaModel: {
        classes: [{ id: 'S', name: 'S', attributes: [] }],
        relations: [{ id: 'rel', kind: 'REFERENCE', source: 'S', target: 'S', name: 'knows' }],
      },
      instanceModels: [{
        id: 'im1',
        kind: 'instancemodel',
        name: 'M',
        objects: [
          { id: 'a', classId: 'S', name: 'A', attributeValues: {} },
          { id: 'b', classId: 'S', name: 'B', attributeValues: {} },
        ],
        links: [{
          id: 'l1', relationId: 'rel', source: 'a', target: 'b',
          sourceHandle: 'right', targetHandle: 'left',
        }],
      }],
      layouts: {},
    };
    const target = {
      metaModel: {
        classes: [{ id: 'T', name: 'T', attributes: [] }],
        relations: [{ id: 'trel', kind: 'REFERENCE', source: 'T', target: 'T', name: 'knows' }],
      },
    };
    const rules = [{
      sourceClassId: 'S',
      targetClassId: 'T',
      attributeMappings: [],
      relationMappings: [{ sourceRelId: 'rel', targetRelId: 'trel' }],
    }];

    const result = runTransform(source, target, rules);
    const im = result.instanceModels[0];
    expect(im.links).toHaveLength(1);

    const link = im.links[0];
    const [objA, objB] = im.objects;
    expect(link.source).toBe(objA.id);
    expect(link.target).toBe(objB.id);
    expect(link.sourceHandle).toBe('right');
    expect(link.targetHandle).toBe('left');
    expect(link.relationId).toBe('trel');
  });

  it('drops links whose relation has no mapping', () => {
    const source = {
      metaModel: {
        classes: [{ id: 'S', name: 'S', attributes: [] }],
        relations: [{ id: 'rel', kind: 'REFERENCE', source: 'S', target: 'S', name: 'knows' }],
      },
      instanceModels: [{
        id: 'im1', kind: 'instancemodel', name: 'M',
        objects: [
          { id: 'a', classId: 'S', name: 'A', attributeValues: {} },
          { id: 'b', classId: 'S', name: 'B', attributeValues: {} },
        ],
        links: [{ id: 'l1', relationId: 'rel', source: 'a', target: 'b' }],
      }],
      layouts: {},
    };
    const target = { metaModel: { classes: [{ id: 'T', name: 'T', attributes: [] }], relations: [] } };
    const rules = [{ sourceClassId: 'S', targetClassId: 'T', attributeMappings: [], relationMappings: [] }];

    const result = runTransform(source, target, rules);
    expect(result.instanceModels[0].links).toHaveLength(0);
  });
});

describe('runTransform — object selection', () => {
  it('skips objects whose class has no rule', () => {
    const source = {
      metaModel: {
        classes: [
          { id: 'S', name: 'S', attributes: [] },
          { id: 'U', name: 'U', attributes: [] },
        ],
        relations: [],
      },
      instanceModels: [{
        id: 'im1', kind: 'instancemodel', name: 'M',
        objects: [
          { id: 'a', classId: 'S', name: 'A', attributeValues: {} },
          { id: 'u', classId: 'U', name: 'U1', attributeValues: {} },
        ],
        links: [],
      }],
      layouts: {},
    };
    const target = { metaModel: { classes: [{ id: 'T', name: 'T', attributes: [] }], relations: [] } };
    const rules = [{ sourceClassId: 'S', targetClassId: 'T', attributeMappings: [], relationMappings: [] }];

    const result = runTransform(source, target, rules);
    const objs = result.instanceModels[0].objects;
    expect(objs).toHaveLength(1);
    expect(objs[0].classId).toBe('T');
  });
});
