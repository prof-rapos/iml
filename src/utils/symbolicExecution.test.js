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

  it('a lone certainly-false guard (nothing complementary) produces no node or edge at all — a provable no-op is not worth a leaf', () => {
    // A single-member trigger group whose guard is definitely false (no
    // catch-all, nothing unresolvable): before, this still produced a
    // self-subsumed "dropped" leaf via fireDropped. Since the state and
    // every tracked attribute provably can't change, that leaf carried zero
    // information — reported as tree bloat against a real example (RPS with
    // a 1-round guard: 28 of 37 nodes were exactly this shape). Now skipped
    // entirely: no node, no edge.
    const soloGuardModel = {
      ...NO_ATTRS,
      classes: [{
        id: 'D', name: 'D',
        attributes: [{ id: 'aX', name: 'x', type: 'INT', lowerBound: 1, upperBound: 1, defaultValue: '0' }],
      }],
      behaviours: {
        D: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
            { id: 'sB', kind: 'simple', name: 'B', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
            { id: 'tB', source: 'sA', target: 'sB', trigger: 'p.go', guard: 'x > 5', effect: '' },
          ],
        },
      },
    };
    const result = buildSET('D', soloGuardModel);
    expect(nodesArr(result)).toHaveLength(1); // just the root — no dropped leaf, no fired edge
    expect(edgesArr(result)).toHaveLength(0);
  });

  it('produces a small, linear tree (no combinatorial blow-up from forking both guard outcomes at every step)', () => {
    const result = buildSET('C', metaModel);
    // 3 loop-back steps (val=1,2,3) reaching Final at val=3 (Counting is
    // entered once per loop, plus once for the initial transition) — a
    // handful of nodes, not a fork-doubling explosion.
    expect(nodesArr(result).length).toBeLessThan(10);
  });
});

describe('buildSET — STRING/ENUM equality guards evaluate when the value is known', () => {
  // Two complementary STRING guards on the same trigger — before this fix,
  // evaluateCondition only ever recognized numeric/boolean RHS literals, so
  // a STRING/ENUM comparison always degraded to 'unknown' even with an
  // exactly-known value, forcing an avoidable fork (both "== NS" and
  // "== EW" explored) at every step.
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'C', name: 'C',
      attributes: [{ id: 'aDir', name: 'dir', type: 'STRING', lowerBound: 1, upperBound: 1, defaultValue: 'NS' }],
    }],
    behaviours: {
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sReady', kind: 'simple', name: 'Ready', entry: '', exit: '' },
          { id: 'sNS', kind: 'simple', name: 'NorthSouth', entry: '', exit: '' },
          { id: 'sEW', kind: 'simple', name: 'EastWest', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sReady', trigger: '', guard: '', effect: 'dir = "NS";' },
          { id: 'tNS', source: 'sReady', target: 'sNS', trigger: 'p.go', guard: 'dir == "NS"', effect: '' },
          { id: 'tEW', source: 'sReady', target: 'sEW', trigger: 'p.go', guard: 'dir == "EW"', effect: '' },
        ],
      },
    },
  };

  it('takes exactly the deterministically-true branch, no fork', () => {
    const result = buildSET('C', metaModel);
    const readyNode = nodesArr(result).find((n) => n.stateId === 'sReady');
    const outgoing = edgesArr(result).filter((e) => e.sourceNodeId === readyNode.id);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].transitionId).toBe('tNS');
    expect(outgoing[0].guardFork).toBe(false);
  });
});

describe('buildSET — an unresolved guard carries a guardReason', () => {
  const metaModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'C', name: 'C',
      attributes: [{ id: 'aVal', name: 'val', type: 'INT', lowerBound: 1, upperBound: 1 }],
    }],
    behaviours: {
      C: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sReady', kind: 'simple', name: 'Ready', entry: '', exit: '' },
          { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sReady', trigger: '', guard: '', effect: '' },
          // "val" is never assigned anywhere, so it's untracked/unknown at
          // this point — a genuinely unresolvable guard, not a typo.
          { id: 'tA', source: 'sReady', target: 'sA', trigger: 'p.go', guard: 'val > 5', effect: '' },
        ],
      },
    },
  };

  it('labels the forked edge with a reason distinguishing it from a typo', () => {
    const result = buildSET('C', metaModel);
    const forked = edgesArr(result).find((e) => e.guardFork);
    expect(forked).toBeDefined();
    expect(forked.guardReason).toMatch(/isn't known for certain/);
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

  // Regression: MAX_DEPTH alone only bounds a single PATH — a machine with
  // several genuinely-unresolvable guard forks chained together can branch
  // combinatorially and blow well past a reasonable node count long before
  // any one path is 40 steps deep (found during a pre-alpha review; this
  // fixture is a synthetic full binary tree of DISTINCT states specifically
  // so every node gets a unique signature and nothing subsumes away the
  // branching — a worst-case stand-in for real unresolvable-guard blowup).
  it('stops a wide (but shallow) combinatorial explosion via the whole-tree node cap, before the depth cap would ever apply', () => {
    const DEPTH = 13; // 2^13 - 1 = 8191 possible states — comfortably over any reasonable node cap, at depth 13 << 40
    const states = [
      { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
      { id: 's0', kind: 'simple', name: 'S0', entry: '', exit: '' },
    ];
    const transitions = [{ id: 'tInit', source: 'sInit', target: 's0', trigger: '', guard: '', effect: '' }];
    let frontier = ['s0'];
    for (let d = 0; d < DEPTH; d++) {
      const next = [];
      for (const parentId of frontier) {
        for (const branch of ['L', 'R']) {
          const childId = `${parentId}${branch}`;
          states.push({ id: childId, kind: 'simple', name: childId, entry: '', exit: '' });
          transitions.push({
            id: `t_${parentId}_${branch}`, source: parentId, target: childId, trigger: 'p.go',
            // References an attribute this class doesn't declare — always
            // evaluates 'unknown', so both branches genuinely fork instead
            // of one being pruned as provably-false.
            guard: branch === 'L' ? 'untracked == 1' : 'untracked == 0', effect: '',
          });
          next.push(childId);
        }
      }
      frontier = next;
    }
    const metaModel = { ...NO_ATTRS, classes: [{ id: 'C', name: 'C', attributes: [] }], behaviours: { C: { states, transitions } } };

    const result = buildSET('C', metaModel);
    const sizeBound = nodesArr(result).filter((n) => n.status === 'leaf-depth-bound');
    expect(sizeBound.length).toBeGreaterThan(0);
    // The whole point: the cap fired from sheer node count, not because any
    // individual path actually reached the 40-step depth cap.
    expect(sizeBound.every((n) => n.depth < 40)).toBe(true);
    expect(nodesArr(result).length).toBeLessThan(10000); // bounded, not the full 16383-node tree
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

// A signal parameter with a bounded (ENUM) domain forks the tree once per
// literal, instead of the parameter always degrading to unknown — the RPS
// example's "player1.sendMove(move)" case, where `move` is a Move enum with
// literals ROCK/PAPER/SCISSORS.
describe('buildSET — enum-bounded signal parameters fork one branch per literal', () => {
  const metaModel = {
    relations: [],
    classes: [{
      id: 'PL', name: 'Player', attributes: [],
      ports: [{ id: 'pIn', name: 'game', protocolId: 'proto1' }],
    }],
    enumerations: [{ id: 'eMove', name: 'Move', literals: ['ROCK', 'PAPER', 'SCISSORS'] }],
    protocols: [{
      id: 'proto1', name: 'RPS',
      signals: [{ id: 'sig1', name: 'sendMove', direction: 'in', params: [{ id: 'p1', name: 'move', type: 'ENUM', enumId: 'eMove' }] }],
    }],
    behaviours: {
      PL: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sWaiting', kind: 'simple', name: 'Waiting', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sWaiting', trigger: '', guard: '', effect: '' },
          { id: 't1', source: 'sWaiting', target: 'sWaiting', trigger: 'game.sendMove', guard: '', effect: '' },
        ],
      },
    },
  };

  it('creates exactly one edge per enum literal, each labeled with its value', () => {
    const result = buildSET('PL', metaModel);
    const outgoing = edgesArr(result).filter((e) => e.sourceNodeId === result.rootId);
    expect(outgoing).toHaveLength(3);
    expect(outgoing.map((e) => e.paramLabel).sort()).toEqual(['PAPER', 'ROCK', 'SCISSORS']);
  });

  it('still subsumes correctly per branch when there is no attribute for the enum literal to affect', () => {
    // Nothing in this fixture tracks the move value, so all 3 forked
    // branches land back on the exact same (state, values) signature —
    // each should subsume straight back to the root as its own edge, not
    // collapse into one edge or crash.
    const result = buildSET('PL', metaModel);
    const subsumed = nodeByStatus(result, 'leaf-subsumed');
    expect(subsumed).toHaveLength(3);
    for (const n of subsumed) expect(n.subsumedByNodeId).toBe(result.rootId);
  });

  it('threads the enum value through effect action code (the p1Move = move; shape)', () => {
    const withAttr = {
      ...metaModel,
      classes: [{
        id: 'PL', name: 'Player', attributes: [{ id: 'aLast', name: 'lastMove', type: 'ENUM', enumId: 'eMove' }],
        ports: metaModel.classes[0].ports,
      }],
      behaviours: {
        PL: {
          ...metaModel.behaviours.PL,
          transitions: metaModel.behaviours.PL.transitions.map((t) =>
            t.id === 't1' ? { ...t, effect: 'lastMove = move;' } : t
          ),
        },
      },
    };
    const result = buildSET('PL', withAttr);
    const children = edgesArr(result)
      .filter((e) => e.sourceNodeId === result.rootId)
      .map((e) => ({ label: e.paramLabel, value: result.nodesById.get(e.targetNodeId).attrValues.get('aLast') }));
    for (const { label, value } of children) {
      expect(value).toEqual({ kind: 'known', value: label });
    }
  });

  it('does not leak the synthetic parameter entry into the child node\'s attrValues', () => {
    const withAttr = {
      ...metaModel,
      classes: [{
        id: 'PL', name: 'Player', attributes: [{ id: 'aLast', name: 'lastMove', type: 'ENUM', enumId: 'eMove' }],
        ports: metaModel.classes[0].ports,
      }],
      behaviours: {
        PL: {
          ...metaModel.behaviours.PL,
          transitions: metaModel.behaviours.PL.transitions.map((t) =>
            t.id === 't1' ? { ...t, effect: 'lastMove = move;' } : t
          ),
        },
      },
    };
    const result = buildSET('PL', withAttr);
    const child = nodesArr(result).find((n) => n.id !== result.rootId);
    expect([...child.attrValues.keys()]).toEqual(['aLast']);
  });

  it('falls back to a single (non-forked) edge for a signal with no enum parameters (no regression)', () => {
    const noParamModel = {
      ...metaModel,
      protocols: [{ id: 'proto1', name: 'RPS', signals: [{ id: 'sig1', name: 'sendMove', direction: 'in', params: [] }] }],
    };
    const result = buildSET('PL', noParamModel);
    const outgoing = edgesArr(result).filter((e) => e.sourceNodeId === result.rootId);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].paramLabel).toBeNull();
  });
});
