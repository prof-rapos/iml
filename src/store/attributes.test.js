import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';

function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'M',
      classes: [
        {
          id: 'A', name: 'A',
          attributes: [{ id: 'aTags', name: 'tags', type: 'STRING', visibility: 'PUBLIC', lowerBound: 0, upperBound: -1, defaultValue: '' }],
        },
      ],
      relations: [], enumerations: [], behaviours: {}, protocols: [],
    },
    instanceModels: [{
      id: 'im1', kind: 'instancemodel', name: 'IM1',
      objects: [
        { id: 'o1', classId: 'A', name: 'o1', attributeValues: { aTags: ['red', 'blue', 'green'] } },
        { id: 'o2', classId: 'A', name: 'o2', attributeValues: { aTags: ['only-one'] } },
      ],
      links: [], connectors: [],
    }],
    currentIMIndex: 0,
    mode: 'metamodel',
    layouts: {},
  });
}

// Regression: narrowing upperBound from multi- to single-valued used to
// silently keep only the first array element on every affected object,
// permanently discarding the rest with no confirmation and no undo — found
// during the pre-alpha review. wouldNarrowingLoseData() is the check
// PropertiesPanel now calls before committing a narrowing edit, to decide
// whether to show a confirmation dialog first.
describe('wouldNarrowingLoseData', () => {
  beforeEach(seed);

  it('is true when at least one affected object holds more than one value', () => {
    expect(useModelStore.getState().wouldNarrowingLoseData('A', 'aTags')).toBe(true);
  });

  it('is false once every affected object holds at most one value', () => {
    useModelStore.getState().updateSlotValues('o1', 'aTags', ['red']);
    expect(useModelStore.getState().wouldNarrowingLoseData('A', 'aTags')).toBe(false);
  });

  it('is false for an attribute that does not exist on any object yet', () => {
    expect(useModelStore.getState().wouldNarrowingLoseData('A', 'nope')).toBe(false);
  });
});

describe('updateAttribute — narrowing multi- to single-valued', () => {
  beforeEach(seed);

  it('still keeps only the first value once the caller actually commits the narrowing', () => {
    // updateAttribute itself is unchanged — it's still the caller's (the
    // UI's) job to confirm first via wouldNarrowingLoseData(); this just
    // confirms the underlying migration behavior wasn't altered.
    useModelStore.getState().updateAttribute('A', 'aTags', { upperBound: 1 });
    const im = useModelStore.getState().instanceModels[0];
    expect(im.objects.find((o) => o.id === 'o1').attributeValues.aTags).toBe('red');
    expect(im.objects.find((o) => o.id === 'o2').attributeValues.aTags).toBe('only-one');
  });
});
