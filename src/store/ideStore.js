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

export function findMainClasses(files) {
  return files
    .filter((f) => /public\s+static\s+void\s+main\s*\(\s*String/.test(f.content))
    .map((f) => ({ path: f.path, className: pathToClassName(f.path) }));
}

export const useIdeStore = create((set, get) => ({
  files: [],
  activeFilePath: null,
  openFilePaths: [],
  projectPackage: '',

  loadFiles: (files, activePath) => {
    // Multi-file imports (Import ZIP, Import Java) enforce no path uniqueness
    // of their own — drop duplicates here so tabs never share a React key.
    const seen = new Set();
    const deduped = files.filter((f) => {
      if (seen.has(f.path)) return false;
      seen.add(f.path);
      return true;
    });
    const paths = deduped.map((f) => f.path);
    set({
      files: deduped,
      openFilePaths: paths,
      activeFilePath: activePath ?? paths[0] ?? null,
      projectPackage: inferPackage(deduped),
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

  renameFile: (oldPath, newPath) => set((s) => {
    if (s.files.some((f) => f.path === newPath)) {
      useModelStore.getState().notify(`A file named "${newPath}" already exists.`);
      return s;
    }
    return {
      files: s.files.map((f) => f.path === oldPath ? { ...f, path: newPath } : f),
      openFilePaths: s.openFilePaths.map((p) => p === oldPath ? newPath : p),
      activeFilePath: s.activeFilePath === oldPath ? newPath : s.activeFilePath,
    };
  }),

  clearProject: () => set({ files: [], activeFilePath: null, openFilePaths: [], projectPackage: '' }),

  setProjectPackage: (pkg) => set({ projectPackage: pkg }),

  hasFiles: () => get().files.length > 0,
}));
