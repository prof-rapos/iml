import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveAutosave, readAutosave, clearAutosave } from './autosave.js';

// This project's tests run under plain Node (no jsdom — every other test
// file here is pure logic with no browser API needs), so localStorage isn't
// a real global. A tiny in-memory stub is enough for what this module calls.
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('autosave', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('round-trips a saved snapshot, stamped with a savedAt time', () => {
    const before = Date.now();
    saveAutosave({ metaModel: { name: 'M' }, instanceModels: [], layouts: {}, dirty: true });
    const read = readAutosave();
    expect(read.metaModel).toEqual({ name: 'M' });
    expect(read.dirty).toBe(true);
    expect(read.savedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns null when nothing has been saved', () => {
    expect(readAutosave()).toBeNull();
  });

  it('returns null for corrupted JSON instead of throwing', () => {
    localStorage.setItem('iml-studio-autosave', '{not valid json');
    expect(readAutosave()).toBeNull();
  });

  it('returns null for a validly-parsed but wrong-shaped value', () => {
    localStorage.setItem('iml-studio-autosave', JSON.stringify({ savedAt: 1, foo: 'bar' }));
    expect(readAutosave()).toBeNull();
  });

  it('clearAutosave removes the snapshot', () => {
    saveAutosave({ metaModel: { name: 'M' }, instanceModels: [], layouts: {}, dirty: true });
    clearAutosave();
    expect(readAutosave()).toBeNull();
  });

  it('the latest save overwrites the previous one', () => {
    saveAutosave({ metaModel: { name: 'First' }, instanceModels: [], layouts: {}, dirty: true });
    saveAutosave({ metaModel: { name: 'Second' }, instanceModels: [], layouts: {}, dirty: false });
    const read = readAutosave();
    expect(read.metaModel.name).toBe('Second');
    expect(read.dirty).toBe(false);
  });
});
