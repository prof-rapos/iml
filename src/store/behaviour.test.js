import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';
import { transitionLabel } from './behaviourStore.js';

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

  it('removes behaviour and sm-layout when the class is deleted', () => {
    useModelStore.getState().addState('C', 'simple');
    useModelStore.getState().setStatePositions('C', { foo: { x: 0, y: 0 } });

    useModelStore.getState().deleteClass('C');

    expect(useModelStore.getState().metaModel.behaviours.C).toBeUndefined();
    expect(useModelStore.getState().layouts['sm-C']).toBeUndefined();
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
