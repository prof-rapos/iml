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

describe('buildSET — guard evaluation against a known tracked attribute', () => {
  // Regression for a real reported model (Done.iml): two complementary
  // guards on the same trigger ("val < 10" / "val >= 10"), both referencing
  // a tracked attribute whose value is exactly known at every step. Guards
  // were previously NEVER evaluated (always forked both ways, same as an
  // unknown guard) — so the tree explored both "val < 10 fired" AND
  // "val >= 10 fired" at every single step, including impossible ones (e.g.
  // "val < 10" firing when val is already known to be 10). Guards with this
  // exact shape use the same evaluable grammar as an action-code
  // if-condition, so they're now actually evaluated: exactly one branch is
  // taken at each step, deterministically, with no impossible sibling edge.
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'C', name: 'C',
      attributes: [{ id: 'aVal', name: 'val', type: 'INT', lowerBound: 1, upperBound: 1, defaultValue: '0' }],
    }],
    behaviours: {
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sCounting', kind: 'simple', name: 'Counting', entry: 'val++;', exit: '' },
          { id: 'sFinal', kind: 'final', name: '', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sCounting', trigger: '', guard: '', effect: '' },
          { id: 'tLoop', source: 'sCounting', target: 'sCounting', trigger: 'timer.timeout', guard: 'val < 3', effect: '' },
          { id: 'tDone', source: 'sCounting', target: 'sFinal', trigger: 'timer.timeout', guard: 'val >= 3', effect: '' },
        ],
      },
    },
  };

  it('takes exactly one deterministic branch per step — no impossible/forked sibling edges', () => {
    const result = buildSET('C', metaModel);
    for (const node of nodesArr(result)) {
      if (node.status !== 'open') continue;
      const outgoingEdges = edgesArr(result).filter((e) => e.sourceNodeId === node.id);
      expect(outgoingEdges).toHaveLength(1);
      expect(outgoingEdges[0].guardFork).toBe(false);
    }
  });

  it('reaches Final exactly once val hits the crossover value, via the correct guard', () => {
    const result = buildSET('C', metaModel);
    const finalNode = nodesArr(result).find((n) => n.status === 'leaf-final');
    expect(finalNode).toBeDefined();
    expect(finalNode.attrValues.get('aVal')).toEqual({ kind: 'known', value: '3' });

    const finalEdge = edgesArr(result).find((e) => e.targetNodeId === finalNode.id);
    expect(finalEdge.transitionId).toBe('tDone');
  });

  it('never produces a dropped ("all guards false") leaf — the guards are complementary and fully evaluable', () => {
    const result = buildSET('C', metaModel);
    const dropped = edgesArr(result).filter((e) => e.branch === 'all-guards-false');
    expect(dropped).toHaveLength(0);
  });

  it('produces a small, linear tree (no combinatorial blow-up from forking both guard outcomes at every step)', () => {
    const result = buildSET('C', metaModel);
    // 3 loop-back steps (val=1,2,3) reaching Final at val=3 (Counting is
    // entered once per loop, plus once for the initial transition) — a
    // handful of nodes, not a fork-doubling explosion.
    expect(nodesArr(result).length).toBeLessThan(10);
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

describe('buildSET — regression: an if-guarded counter must track exactly and reach its true fixed point', () => {
  // Mirrors the reported PingPong bug and its follow-up: an entry action like
  // `if (count < 10) { count++; ... }` was first misread as an unconditional
  // count++ (each line matched independently, so count grew forever and hit
  // the depth bound instead of terminating). The real desired behaviour goes
  // further than just not-misreading it: since `count < 10` is a comparison
  // against a literal on an attribute we track exactly, it should actually
  // be evaluated — count increments once per cycle (1, 2, 3, ... 10), no two
  // of those are subsumption-equivalent, and only once count reaches 10 does
  // the guard block the increment, producing a real fixed point that
  // subsumes on the next revisit.
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'P', name: 'Pinger',
      attributes: [{ id: 'aCount', name: 'count', type: 'INT', lowerBound: 1, upperBound: 1, defaultValue: '0' }],
    }],
    behaviours: {
      P: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sPing', kind: 'simple', name: 'Ping', entry: 'if (count < 10) {\n  count++;\n  log.log("PING " + count);\n  pinger.ping();\n}', exit: '' },
          { id: 'sWaiting', kind: 'simple', name: 'Waiting', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sPing', trigger: '', guard: '', effect: '' },
          { id: 't1', source: 'sPing', target: 'sWaiting', trigger: 'pinger.pong', guard: '', effect: 'timer.informIn(500);' },
          { id: 't2', source: 'sWaiting', target: 'sPing', trigger: 'timer.timeout', guard: '', effect: '' },
        ],
      },
    },
  };

  it('terminates via subsumption once count reaches its fixed point, never hitting the depth bound', () => {
    const result = buildSET('P', metaModel);
    expect(nodesArr(result).some((n) => n.status === 'leaf-depth-bound')).toBe(false);
    const subsumed = nodesArr(result).filter((n) => n.status === 'leaf-subsumed');
    expect(subsumed).toHaveLength(1);
    expect(subsumed[0].stateId).toBe('sPing');
    expect(subsumed[0].attrValues.get('aCount')).toEqual({ kind: 'known', value: '10' });
  });

  it('tracks count exactly through every cycle (1..10), never skipping or exceeding the guard', () => {
    const result = buildSET('P', metaModel);
    const pingCounts = nodesArr(result)
      .filter((n) => n.stateId === 'sPing')
      .map((n) => Number(n.attrValues.get('aCount').value))
      .sort((a, b) => a - b);
    expect(pingCounts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]); // the 2nd "10" is the subsumed revisit
  });

  it('subsumes the revisit into the earlier count=10 node, not a fresh one', () => {
    const result = buildSET('P', metaModel);
    const subsumed = nodesArr(result).find((n) => n.status === 'leaf-subsumed');
    const target = result.nodesById.get(subsumed.subsumedByNodeId);
    expect(target.stateId).toBe('sPing');
    expect(target.attrValues.get('aCount')).toEqual({ kind: 'known', value: '10' });
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
