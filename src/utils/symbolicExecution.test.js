import { describe, it, expect } from 'vitest';
import { buildSET, signatureOf } from './symbolicExecution.js';

const NO_ATTRS = { relations: [] };

function nodesArr(result) {
  return [...result.nodesById.values()];
}
function edgesArr(result) {
  return [...result.edgesById.values()];
}
function nodeByStatus(result, status) {
  return nodesArr(result).filter((n) => n.status === status);
}

describe('buildSET — subsumption on a cyclic machine', () => {
  const metaModel = {
    ...NO_ATTRS,
    classes: [{ id: 'TL', name: 'TrafficLight', attributes: [] }],
    behaviours: {
      TL: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sRed', kind: 'simple', name: 'Red', entry: '', exit: '' },
          { id: 'sGreen', kind: 'simple', name: 'Green', entry: '', exit: '' },
          { id: 'sYellow', kind: 'simple', name: 'Yellow', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sRed', trigger: '', guard: '', effect: '' },
          { id: 't1', source: 'sRed', target: 'sGreen', trigger: 'p.safe', guard: '', effect: '' },
          { id: 't2', source: 'sGreen', target: 'sYellow', trigger: 'timer.timeout', guard: '', effect: '' },
          { id: 't3', source: 'sYellow', target: 'sRed', trigger: 'timer.timeout', guard: '', effect: '' },
        ],
      },
    },
  };

  const result = buildSET('TL', metaModel);

  it('explores exactly one full cycle before the second Red subsumes', () => {
    const open = nodeByStatus(result, 'open');
    expect(open.map((n) => n.stateId).sort()).toEqual(['sGreen', 'sRed', 'sYellow'].sort());

    const subsumed = nodeByStatus(result, 'leaf-subsumed');
    expect(subsumed).toHaveLength(1);
    expect(subsumed[0].stateId).toBe('sRed');
    expect(subsumed[0].subsumedByNodeId).toBe(result.rootId);
  });

  it('root is the Red state (the initial pseudostate itself is not a node)', () => {
    expect(result.nodesById.get(result.rootId).stateId).toBe('sRed');
  });
});

describe('buildSET — attribute tracking', () => {
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'C', name: 'C',
      attributes: [{ id: 'aX', name: 'x', type: 'INT', lowerBound: 1, upperBound: 1 }],
    }],
    behaviours: {
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sA', kind: 'simple', name: 'A', entry: 'x = 5;', exit: '' },
          { id: 'sB', kind: 'simple', name: 'B', entry: 'x = x + 1;', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
          { id: 't1', source: 'sA', target: 'sB', trigger: 'p.go', guard: '', effect: '' },
        ],
      },
    },
  };

  const result = buildSET('C', metaModel);
  const root = result.nodesById.get(result.rootId);
  const child = nodesArr(result).find((n) => n.stateId === 'sB');

  it('tracks a literal assignment on the root', () => {
    expect(root.attrValues.get('aX')).toEqual({ kind: 'known', value: '5' });
  });

  it('tracks self-referential arithmetic on the child', () => {
    expect(child.attrValues.get('aX')).toEqual({ kind: 'known', value: '6' });
  });
});

describe('buildSET — unknown attribute propagation', () => {
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'C', name: 'C',
      attributes: [{ id: 'aX', name: 'x', type: 'INT', lowerBound: 1, upperBound: 1 }],
    }],
    behaviours: {
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sA', kind: 'simple', name: 'A', entry: 'x = compute();', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
        ],
      },
    },
  };

  it('marks x unknown when its assignment is not a recognized literal/arithmetic form', () => {
    const result = buildSET('C', metaModel);
    const root = result.nodesById.get(result.rootId);
    expect(root.attrValues.get('aX')).toEqual({ kind: 'unknown' });
  });
});

describe('buildSET — guard chains', () => {
  it('creates one edge per guard plus a trailing all-guards-false edge when no catch-all exists', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
            { id: 'sB', kind: 'simple', name: 'B', entry: '', exit: '' },
            { id: 'sC', kind: 'simple', name: 'C', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
            { id: 'tB', source: 'sA', target: 'sB', trigger: 'p.go', guard: 'x > 5', effect: '' },
            { id: 'tC', source: 'sA', target: 'sC', trigger: 'p.go', guard: 'x <= 5', effect: '' },
          ],
        },
      },
    };

    const result = buildSET('C', metaModel);
    const root = result.nodesById.get(result.rootId);
    const outgoingEdges = edgesArr(result).filter((e) => e.sourceNodeId === root.id);

    expect(outgoingEdges).toHaveLength(3);
    expect(outgoingEdges.every((e) => e.guardFork)).toBe(true);
    expect(outgoingEdges.map((e) => e.branch).sort()).toEqual(['all-guards-false', 'guard-0-true', 'guard-1-true']);

    const droppedTarget = outgoingEdges.find((e) => e.branch === 'all-guards-false');
    const droppedNode = result.nodesById.get(droppedTarget.targetNodeId);
    expect(droppedNode.status).toBe('leaf-subsumed');
    expect(droppedNode.subsumedByNodeId).toBe(root.id);
  });

  it('treats an early unconditional transition as absorbing later guarded ones (dead code, matches generated dispatch())', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
            { id: 'sB', kind: 'simple', name: 'B', entry: '', exit: '' },
            { id: 'sC', kind: 'simple', name: 'C', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
            { id: 'tB', source: 'sA', target: 'sB', trigger: 'p.go', guard: '', effect: '' },
            { id: 'tC', source: 'sA', target: 'sC', trigger: 'p.go', guard: 'x > 5', effect: '' },
          ],
        },
      },
    };

    const result = buildSET('C', metaModel);
    const root = result.nodesById.get(result.rootId);
    const outgoingEdges = edgesArr(result).filter((e) => e.sourceNodeId === root.id);

    expect(outgoingEdges).toHaveLength(1);
    expect(outgoingEdges[0].branch).toBe('unconditional');
    expect(result.nodesById.get(outgoingEdges[0].targetNodeId).stateId).toBe('sB');
  });
});

describe('buildSET — final state and dead ends', () => {
  it('marks a transition into the Final pseudostate as leaf-final, never expanded', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
            { id: 'sFinal', kind: 'final', name: '', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
            { id: 't1', source: 'sA', target: 'sFinal', trigger: 'p.done', guard: '', effect: '' },
          ],
        },
      },
    };

    const result = buildSET('C', metaModel);
    const finalNode = nodesArr(result).find((n) => n.status === 'leaf-final');
    expect(finalNode).toBeDefined();
    expect(finalNode.stateId).toBe('sFinal');
  });

  it('marks a state with no outgoing triggered transitions as leaf-deadend', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
          ],
        },
      },
    };

    const result = buildSET('C', metaModel);
    expect(result.nodesById.get(result.rootId).status).toBe('leaf-deadend');
  });
});

describe('buildSET — depth bound backstop', () => {
  it('stops an unbounded self-incrementing loop at the depth bound', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{
        id: 'C', name: 'C',
        attributes: [{ id: 'aX', name: 'x', type: 'INT', lowerBound: 1, upperBound: 1 }],
      }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: 'x = 0;' },
            { id: 'tLoop', source: 'sA', target: 'sA', trigger: 'p.tick', guard: '', effect: 'x = x + 1;' },
          ],
        },
      },
    };

    const result = buildSET('C', metaModel);
    const depthBound = nodesArr(result).filter((n) => n.status === 'leaf-depth-bound');
    expect(depthBound).toHaveLength(1);
    expect(depthBound[0].depth).toBe(40);
    expect(nodesArr(result).every((n) => n.depth <= 40)).toBe(true);
  });
});

describe('buildSET — malformed machine', () => {
  it('returns an empty (root-only) tree when there is no resolvable initial transition', () => {
    const metaModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      behaviours: { C: { states: [], transitions: [] } },
    };
    const result = buildSET('C', metaModel);
    expect(result.rootId).toBeTruthy();
    expect(result.nodesById.size).toBe(1);
    expect(result.nodesById.get(result.rootId).status).toBe('leaf-deadend');
  });
});

describe('signatureOf', () => {
  it('is order-independent across attribute insertion order', () => {
    const a = new Map([['id1', { kind: 'known', value: '1' }], ['id2', { kind: 'known', value: '2' }]]);
    const b = new Map([['id2', { kind: 'known', value: '2' }], ['id1', { kind: 'known', value: '1' }]]);
    expect(signatureOf('sA', a)).toBe(signatureOf('sA', b));
  });

  it('differs when an attribute is known on one side and unknown on the other (strict subsumption)', () => {
    const a = new Map([['id1', { kind: 'known', value: '1' }]]);
    const b = new Map([['id1', { kind: 'unknown' }]]);
    expect(signatureOf('sA', a)).not.toBe(signatureOf('sA', b));
  });
});
