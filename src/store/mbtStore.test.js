import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSET } from '../utils/symbolicExecution.js';
import { pathIdsFor, useMbtStore } from './mbtStore.js';
import { useModelStore } from './modelStore.js';

const NO_ATTRS = { relations: [] };

// Root -> A -> B (leaf-deadend). Same fixture shape as symbolicExecution.test.js.
const metaModel = {
  ...NO_ATTRS,
  classes: [{ id: 'C', name: 'C', attributes: [] }],
  behaviours: {
    C: {
      states: [
        { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
        { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
        { id: 'sB', kind: 'simple', name: 'B', entry: '', exit: '' },
      ],
      transitions: [
        { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
        { id: 't1', source: 'sA', target: 'sB', trigger: 'p.go', guard: '', effect: '' },
      ],
    },
  },
};

describe('pathIdsFor', () => {
  const result = buildSET('C', metaModel);
  const leaf = [...result.nodesById.values()].find((n) => n.stateId === 'sB');

  it('includes the root and every node along the path to the leaf', () => {
    const { pathNodeIds } = pathIdsFor(leaf.id, result);
    expect(pathNodeIds.has(result.rootId)).toBe(true);
    expect(pathNodeIds.has(leaf.id)).toBe(true);
    expect(pathNodeIds.size).toBe(2); // root (A) -> leaf (B)
  });

  it('includes every edge along the path', () => {
    const { pathEdgeIds } = pathIdsFor(leaf.id, result);
    expect(pathEdgeIds.size).toBe(1);
  });

  it('returns null sets for a falsy leafId or missing setResult', () => {
    expect(pathIdsFor(null, result)).toEqual({ pathNodeIds: null, pathEdgeIds: null });
    expect(pathIdsFor(leaf.id, null)).toEqual({ pathNodeIds: null, pathEdgeIds: null });
  });

  it('returns null sets for a leaf id that does not exist in the tree', () => {
    expect(pathIdsFor('nope', result)).toEqual({ pathNodeIds: null, pathEdgeIds: null });
  });
});

// Real integration test against the actual store instances (not a mock) —
// this is the exact mechanism reported as a bug: after loading a different
// model, the SET Viewer kept showing the previous model's tree, and every
// node's state label broke (looked up against the NEW model's
// metaModel.behaviours[capsuleId], which no longer had that key) — "(unnamed)"
// was a symptom of this, not a separate bug.
describe('useMbtStore — clears a stale tree when the model is swapped out from under it', () => {
  beforeEach(() => {
    useMbtStore.setState({
      capsuleId: null, setResult: null, nodes: [], edges: [],
      selectedLeafId: null, pathNodeIds: null, pathEdgeIds: null, building: false,
    });
  });

  it('clears capsuleId/setResult once the current capsule no longer resolves in the new model', () => {
    vi.useFakeTimers();
    try {
      useModelStore.setState({ metaModel: metaModel });
      useMbtStore.getState().setCapsule('C');
      vi.runAllTimers(); // flush the deferred buildSET

      expect(useMbtStore.getState().capsuleId).toBe('C');
      expect(useMbtStore.getState().setResult).not.toBeNull();

      // Swap in a completely different model — different class ids, as a
      // real "import a different project" would produce.
      useModelStore.setState({
        metaModel: {
          ...NO_ATTRS,
          classes: [{ id: 'OTHER', name: 'Other', attributes: [] }],
          behaviours: { OTHER: { states: [], transitions: [] } },
        },
      });

      expect(useMbtStore.getState().capsuleId).toBeNull();
      expect(useMbtStore.getState().setResult).toBeNull();
      expect(useMbtStore.getState().nodes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT clear the tree for an unrelated model edit that leaves the capsule resolvable', () => {
    vi.useFakeTimers();
    try {
      useModelStore.setState({ metaModel: metaModel });
      useMbtStore.getState().setCapsule('C');
      vi.runAllTimers();
      const builtResult = useMbtStore.getState().setResult;
      expect(builtResult).not.toBeNull();

      // Same capsule still present — e.g. the user renamed the meta-model,
      // an edit that produces a new metaModel object reference but doesn't
      // remove class 'C' or its behaviour.
      useModelStore.setState({ metaModel: { ...metaModel, name: 'Renamed' } });

      expect(useMbtStore.getState().capsuleId).toBe('C');
      expect(useMbtStore.getState().setResult).toBe(builtResult); // untouched, not rebuilt
    } finally {
      vi.useRealTimers();
    }
  });
});
