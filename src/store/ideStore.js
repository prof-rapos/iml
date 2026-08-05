import { create } from 'zustand';
import { useModelStore } from './modelStore';

function inferPackage(files) {
  const first = files[0];
  if (!first) return '';
  const parts = first.path.split('/');
  return parts.slice(0, -1).join('.');
}

export function pathToClassName(path) {
  return path.replace(/\.java$/, '').replace(/\//g, '.');
}

export function packageToDir(pkg) {
  return pkg.replace(/\./g, '/');
}

// Best-effort (regex, not a parser) comment stripping so findMainClasses
// doesn't false-positive on a main signature written inside a comment
// (e.g. `// public static void main(String[] args) { ... }` left as a
// note). Doesn't account for a "//"/"/*" appearing inside a string literal —
// an accepted, documented tradeoff at the same level as this file's other
// regex heuristics.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

export function findMainClasses(files) {
  return files
    .filter((f) => /public\s+static\s+void\s+main\s*\(\s*String/.test(stripComments(f.content)))
    .map((f) => ({ path: f.path, className: pathToClassName(f.path) }));
}

// A base-name identifier rule matching NewFileDialog's — reused so a rename
// gets the same validation a create already gets, instead of accepting any
// string (a slash silently nesting the file, a lowercase-starting name, etc).
const CLASS_NAME_RE = /^[A-Z][a-zA-Z0-9_]*$/;

// Best-effort (regex, not a parser — same tradeoff findMainClasses already
// makes) extraction of the top-level public type's name, to warn when a
// rename leaves the file's own class/interface/enum declaration out of sync
// with its new filename — Java requires them to match, and that failure
// otherwise surfaces later as a compile error with no link back to the rename.
function extractPublicTypeName(content) {
  const m = content.match(/public\s+(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m ? m[1] : null;
}

// FileTree's buildTree treats every path segment but the last as a directory —
// if some OTHER file's full path is a proper prefix of this one, that other
// file would need to double as both a leaf and a directory, which buildTree
// silently refuses (to avoid assigning a property onto a string primitive)
// by just dropping this deeper file from the rendered tree. It stays in
// `files` (so it's still compiled) but becomes permanently unreachable —
// can't be selected, renamed, or deleted from the UI. Drop it here instead,
// with a message, so it's at least visible that something happened.
function dropStructuralCollisions(files) {
  const filePaths = new Set(files.map((f) => f.path));
  const kept = [];
  let dropped = 0;
  for (const f of files) {
    const parts = f.path.split('/');
    const collides = parts.slice(0, -1).some((_, i) => filePaths.has(parts.slice(0, i + 1).join('/')));
    if (collides) dropped++;
    else kept.push(f);
  }
  return { kept, dropped };
}

export const useIdeStore = create((set, get) => ({
  files: [],
  activeFilePath: null,
  openFilePaths: [],
  projectPackage: '',

  loadFiles: (files, activePath) => {
    // Multi-file imports (Import ZIP, Import Java) enforce no path uniqueness
    // of their own — drop duplicates here so tabs never share a React key.
    // A plain <input type=file multiple> import has no folder info at all,
    // so two same-named files from different source folders collide here —
    // used to vanish with no indication anything was dropped.
    const seen = new Set();
    let dropped = 0;
    const deduped = files.filter((f) => {
      if (seen.has(f.path)) { dropped++; return false; }
      seen.add(f.path);
      return true;
    });
    if (dropped > 0) {
      useModelStore.getState().notify(`${dropped} file${dropped !== 1 ? 's' : ''} skipped — same name as another imported file (folder structure isn't preserved when importing individual files; use Import ZIP for that).`);
    }
    const { kept, dropped: structDropped } = dropStructuralCollisions(deduped);
    if (structDropped > 0) {
      useModelStore.getState().notify(`${structDropped} file${structDropped !== 1 ? 's' : ''} skipped — path conflicts with another imported file acting as both a file and a folder.`);
    }
    const paths = kept.map((f) => f.path);
    set({
      files: kept,
      openFilePaths: paths,
      activeFilePath: activePath ?? paths[0] ?? null,
      projectPackage: inferPackage(kept),
    });
  },

  openFile: (path) => set((s) => ({
    openFilePaths: s.openFilePaths.includes(path)
      ? s.openFilePaths
      : [...s.openFilePaths, path],
    activeFilePath: path,
  })),

  closeTab: (path) => set((s) => {
    const remaining = s.openFilePaths.filter((p) => p !== path);
    const idx = s.openFilePaths.indexOf(path);
    const newActive = s.activeFilePath === path
      ? (remaining[Math.min(idx, remaining.length - 1)] ?? null)
      : s.activeFilePath;
    return { openFilePaths: remaining, activeFilePath: newActive };
  }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateContent: (path, content) => set((s) => ({
    files: s.files.map((f) => f.path === path ? { ...f, content } : f),
  })),

  addFile: (path, content) => set((s) => {
    const exists = s.files.some((f) => f.path === path);
    return {
      files: exists
        ? s.files.map((f) => f.path === path ? { ...f, content } : f)
        : [...s.files, { path, content }],
      openFilePaths: s.openFilePaths.includes(path)
        ? s.openFilePaths
        : [...s.openFilePaths, path],
      activeFilePath: path,
    };
  }),

  deleteFile: (path) => set((s) => {
    const files = s.files.filter((f) => f.path !== path);
    const openFilePaths = s.openFilePaths.filter((p) => p !== path);
    const idx = s.openFilePaths.indexOf(path);
    const newActive = s.activeFilePath === path
      ? (openFilePaths[Math.max(0, idx - 1)] ?? null)
      : s.activeFilePath;
    return { files, openFilePaths, activeFilePath: newActive };
  }),

  renameFile: (oldPath, newPath) => {
    // A rename only ever changes the base name — a slash anywhere in the
    // typed value (the caller folds it into newPath's directory) used to
    // silently nest the file into a different location instead of just
    // renaming it in place.
    const oldDir = oldPath.split('/').slice(0, -1).join('/');
    const newDir = newPath.split('/').slice(0, -1).join('/');
    if (oldDir !== newDir) {
      useModelStore.getState().notify(`File names can't contain "/" — that would move "${oldPath}" into a different folder instead of just renaming it.`);
      return;
    }
    const newBase = newPath.split('/').pop().replace(/\.java$/, '');
    if (!CLASS_NAME_RE.test(newBase)) {
      useModelStore.getState().notify(`"${newBase}" isn't a valid file name — it must start with an uppercase letter and contain only letters, digits, and underscores.`);
      return;
    }
    set((s) => {
      if (s.files.some((f) => f.path === newPath)) {
        useModelStore.getState().notify(`A file named "${newPath}" already exists.`);
        return s;
      }
      const renamed = s.files.find((f) => f.path === oldPath);
      const publicType = renamed ? extractPublicTypeName(renamed.content) : null;
      if (publicType && publicType !== newBase) {
        useModelStore.getState().notify(`Renamed to "${newBase}.java", but the file still declares "${publicType}" — Java requires them to match, so this won't compile until that declaration is renamed too.`);
      }
      return {
        files: s.files.map((f) => f.path === oldPath ? { ...f, path: newPath } : f),
        openFilePaths: s.openFilePaths.map((p) => p === oldPath ? newPath : p),
        activeFilePath: s.activeFilePath === oldPath ? newPath : s.activeFilePath,
      };
    });
  },

  clearProject: () => set({ files: [], activeFilePath: null, openFilePaths: [], projectPackage: '' }),

  setProjectPackage: (pkg) => set({ projectPackage: pkg }),

  hasFiles: () => get().files.length > 0,
}));
