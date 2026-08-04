import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';

function baseModel(name = 'M') {
  return {
    kind: 'metamodel', name,
    classes: [{ id: 'A', name: 'A', attributes: [] }],
    relations: [], enumerations: [], behaviours: {}, protocols: [],
  };
}

function seed() {
  // Two calls, not one: setting metaModel/instanceModels here is itself a
  // "change" the dirty-tracking subscribe handler reacts to (same as any
  // real edit would), so it flips dirty back to true immediately after —
  // resetting it needs to happen in a SEPARATE call once that's settled,
  // exactly like the real app's loadFromJSON/clearMetaModel do (via
  // suppressDirty, not available to a raw test-harness setState).
  useModelStore.setState({
    metaModel: baseModel(),
    instanceModels: [{ id: 'im1', kind: 'instancemodel', name: 'IM1', objects: [], links: [], connectors: [] }],
    currentIMIndex: 0,
    layouts: {},
  });
  useModelStore.setState({ dirty: false });
}

// Regression: with no autosave anywhere in the app, an accidental refresh
// silently destroyed the whole in-progress session with zero warning. The
// `dirty` flag (read by App.jsx's beforeunload handler) is the guard — this
// tests the flag's own bookkeeping in isolation from the actual browser
// event, which isn't practical to exercise in a store-level test.
describe('dirty tracking', () => {
  beforeEach(seed);

  it('starts false and flips true on an ordinary edit', () => {
    expect(useModelStore.getState().dirty).toBe(false);
    useModelStore.getState().addClass();
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it('flips true on an instance-model-only edit too', () => {
    useModelStore.getState().addObject('A');
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it('does NOT flip true just from switching which instance model tab is active', () => {
    useModelStore.getState().addInstanceModel();
    useModelStore.setState({ dirty: false }); // addInstanceModel itself is an edit; reset to isolate the switch
    useModelStore.getState().switchInstanceModel(0);
    expect(useModelStore.getState().dirty).toBe(false);
  });

  it('loadFromJSON resets dirty to false even after prior edits, across its several internal set() calls', () => {
    useModelStore.getState().addClass();
    expect(useModelStore.getState().dirty).toBe(true);

    useModelStore.getState().loadFromJSON({
      metaModel: baseModel('Loaded'),
      instanceModels: [{ id: 'im2', objects: [], links: [] }],
      layouts: {},
    });
    expect(useModelStore.getState().dirty).toBe(false);
  });

  it('loadFromJSON does not mark dirty even though it never touched the flag directly (suppressed for its whole duration)', () => {
    useModelStore.getState().loadFromJSON({ metaModel: baseModel('Loaded2'), instanceModels: [] });
    expect(useModelStore.getState().dirty).toBe(false);
    // ...but an edit right after a load still correctly marks dirty again.
    useModelStore.getState().addClass();
    expect(useModelStore.getState().dirty).toBe(true);
  });

  it('a rejected/invalid loadFromJSON (fails validation) does not touch dirty at all', () => {
    useModelStore.getState().addClass();
    expect(useModelStore.getState().dirty).toBe(true);
    useModelStore.getState().loadFromJSON({ metaModel: {} }); // missing classes/relations — rejected
    expect(useModelStore.getState().dirty).toBe(true); // unchanged — the edit from addClass is still real
  });

  it('clearMetaModel resets dirty to false', () => {
    useModelStore.getState().addClass();
    expect(useModelStore.getState().dirty).toBe(true);
    useModelStore.getState().clearMetaModel();
    expect(useModelStore.getState().dirty).toBe(false);
  });

  it('clearInstanceModel resets dirty to false', () => {
    useModelStore.getState().addObject('A');
    expect(useModelStore.getState().dirty).toBe(true);
    useModelStore.getState().clearInstanceModel();
    expect(useModelStore.getState().dirty).toBe(false);
  });
});
