import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';
import { transitionLabel, useBehaviourStore } from './behaviourStore.js';

// Reset the store to a single-class meta-model before each test.
function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'M',
      classes: [{ id: 'C', name: 'C', attributes: [] }],
      relations: [], enumerations: [], behaviours: {},
    },
    layouts: {},
  });
}

describe('modelStore — behaviour (state machine) actions', () => {
  beforeEach(seed);

  it('adds states and enforces a single initial state', () => {
    const s = useModelStore.getState();
    expect(s.addState('C', 'initial')).toBeTruthy();
    expect(useModelStore.getState().addState('C', 'initial')).toBeNull(); // second rejected
    expect(useModelStore.getState().addState('C', 'simple')).toBeTruthy();

    const sm = useModelStore.getState().getBehaviour('C');
    expect(sm.states.filter((x) => x.kind === 'initial')).toHaveLength(1);
    expect(sm.states.filter((x) => x.kind === 'simple')).toHaveLength(1);
  });

  it('names simple states sequentially', () => {
    const s = useModelStore.getState();
    s.addState('C', 'simple');
    useModelStore.getState().addState('C', 'simple');
    expect(useModelStore.getState().getBehaviour('C').states.map((x) => x.name)).toEqual(['State1', 'State2']);
  });

  it('names a new simple state around a gap left by deleting an earlier one, instead of colliding', () => {
    const a = useModelStore.getState().addState('C', 'simple'); // State1
    useModelStore.getState().addState('C', 'simple');           // State2
    useModelStore.getState().deleteState('C', a);                // only State2 remains

    useModelStore.getState().addState('C', 'simple');
    const names = useModelStore.getState().getBehaviour('C').states.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length); // no duplicate names
  });

  it('deletes a state and cascades its transitions and layout', () => {
    const a = useModelStore.getState().addState('C', 'simple');
    const b = useModelStore.getState().addState('C', 'simple');
    const t = useModelStore.getState().addTransition('C', a, b, 'right', 'left');
    useModelStore.getState().setStatePositions('C', { [a]: { x: 1, y: 2 } });

    useModelStore.getState().deleteState('C', a);

    const sm = useModelStore.getState().getBehaviour('C');
    expect(sm.states.some((x) => x.id === a)).toBe(false);
    expect(sm.transitions.some((x) => x.id === t)).toBe(false);   // cascaded
    expect(useModelStore.getState().layouts['sm-C'][a]).toBeUndefined();
  });

  it('updates a transition and stores handles', () => {
    const a = useModelStore.getState().addState('C', 'simple');
    const b = useModelStore.getState().addState('C', 'simple');
    const t = useModelStore.getState().addTransition('C', a, b, 'right', 'left');
    useModelStore.getState().updateTransition('C', t, { trigger: 'go', guard: 'x>0', effect: 'run()' });

    const tr = useModelStore.getState().getBehaviour('C').transitions.find((x) => x.id === t);
    expect(tr).toMatchObject({ trigger: 'go', guard: 'x>0', effect: 'run()', sourceHandle: 'right', targetHandle: 'left' });
  });

  it('rejects an outgoing transition from a final state and an incoming one to the initial state', () => {
    const init  = useModelStore.getState().addState('C', 'initial');
    const mid   = useModelStore.getState().addState('C', 'simple');
    const fin   = useModelStore.getState().addState('C', 'final');

    expect(useModelStore.getState().addTransition('C', fin, mid)).toBeNull();
    expect(useModelStore.getState().addTransition('C', mid, init)).toBeNull();
    expect(useModelStore.getState().getBehaviour('C').transitions).toHaveLength(0);

    // A valid transition still goes through.
    expect(useModelStore.getState().addTransition('C', init, mid)).toBeTruthy();
  });

  it('rejects reconnecting an existing transition onto a final source or initial target', () => {
    const init = useModelStore.getState().addState('C', 'initial');
    const a    = useModelStore.getState().addState('C', 'simple');
    const b    = useModelStore.getState().addState('C', 'simple');
    const fin  = useModelStore.getState().addState('C', 'final');
    const t    = useModelStore.getState().addTransition('C', a, b);

    useModelStore.getState().updateTransition('C', t, { source: fin });
    expect(useModelStore.getState().getBehaviour('C').transitions.find((x) => x.id === t).source).toBe(a); // unchanged

    useModelStore.getState().updateTransition('C', t, { target: init });
    expect(useModelStore.getState().getBehaviour('C').transitions.find((x) => x.id === t).target).toBe(b); // unchanged
  });

  it('removes behaviour and sm-layout when the class is deleted', () => {
    useModelStore.getState().addState('C', 'simple');
    useModelStore.getState().setStatePositions('C', { foo: { x: 0, y: 0 } });

    useModelStore.getState().deleteClass('C');

    expect(useModelStore.getState().metaModel.behaviours.C).toBeUndefined();
    expect(useModelStore.getState().layouts['sm-C']).toBeUndefined();
  });

  it('onNodesChange prioritises a selected:true change over a same-batch deselect, so clicking a different state switches selection instead of flashing null', () => {
    const a = useModelStore.getState().addState('C', 'simple');
    const b = useModelStore.getState().addState('C', 'simple');
    useBehaviourStore.setState({ selectedId: a, selectedType: 'node' });

    // React Flow can report a's deselect before b's select in the same batch.
    useBehaviourStore.getState().onNodesChange([
      { type: 'select', id: a, selected: false },
      { type: 'select', id: b, selected: true },
    ]);

    const s = useBehaviourStore.getState();
    expect(s.selectedId).toBe(b);
    expect(s.selectedType).toBe('node');
  });

  it('clearMetaModel wipes layouts too, so no orphaned mm/sm-*/im-* entries survive', () => {
    useModelStore.getState().addState('C', 'simple');
    useModelStore.setState((s) => ({
      layouts: { ...s.layouts, mm: { C: { x: 1, y: 2 } }, 'sm-C': { foo: { x: 0, y: 0 } }, 'im-old': { bar: { x: 3, y: 4 } } },
    }));

    useModelStore.getState().clearMetaModel();

    expect(useModelStore.getState().layouts).toEqual({});
  });
});

describe('transitionLabel', () => {
  it('formats trigger [guard] / effect, omitting empty parts', () => {
    expect(transitionLabel({ trigger: 'go', guard: 'x>0', effect: 'run()' })).toBe('go [x>0] / run()');
    expect(transitionLabel({ trigger: 'go' })).toBe('go');
    expect(transitionLabel({ guard: 'g' })).toBe('[g]');
    expect(transitionLabel({ effect: 'e' })).toBe('/ e');
    expect(transitionLabel({})).toBe('');
  });
});
