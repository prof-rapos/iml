// Periodic localStorage snapshot of the current model, so an accidental
// refresh/crash the beforeunload warning didn't prevent (the user confirmed
// it anyway, or the browser just died) still has something to recover.
// Deliberately NOT a substitute for Export IML — this is crash recovery,
// not a save format; it's overwritten on every real edit and never
// versioned.
const KEY = 'iml-studio-autosave';

// Wrapped in try/catch throughout: localStorage can throw (quota exceeded,
// private/incognito browsing in some browsers) — autosave is a nice-to-have
// safety net, never worth crashing or blocking the app over.
export function saveAutosave(payload) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), ...payload }));
  } catch {
    // ignore — see file comment
  }
}

// Returns { savedAt, metaModel, instanceModels, layouts, dirty } or null.
export function readAutosave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.metaModel) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
