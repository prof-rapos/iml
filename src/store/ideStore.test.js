import { describe, it, expect, beforeEach } from 'vitest';
import { useIdeStore, findMainClasses } from './ideStore.js';
import { useModelStore } from './modelStore.js';

function resetIde() {
  useIdeStore.setState({ files: [], activeFilePath: null, openFilePaths: [], projectPackage: '' });
  useModelStore.setState({ notification: null });
}

describe('findMainClasses', () => {
  it('finds a real main() method', () => {
    const files = [{ path: 'Foo.java', content: 'public class Foo {\n  public static void main(String[] args) {}\n}' }];
    expect(findMainClasses(files).map((m) => m.className)).toEqual(['Foo']);
  });

  it('ignores a main() signature written inside a comment', () => {
    const files = [{
      path: 'Foo.java',
      content: [
        'public class Foo {',
        '  // public static void main(String[] args) { /* old entry point */ }',
        '  /* public static void main(String[] args) {} */',
        '}',
      ].join('\n'),
    }];
    expect(findMainClasses(files)).toEqual([]);
  });
});

describe('ideStore — loadFiles', () => {
  beforeEach(resetIde);

  it('drops an exact-duplicate path and notifies', () => {
    useIdeStore.getState().loadFiles([
      { path: 'a/Foo.java', content: 'class Foo {}' },
      { path: 'a/Foo.java', content: 'class Foo {} // different source, same path' },
    ]);
    expect(useIdeStore.getState().files).toHaveLength(1);
    expect(useModelStore.getState().notification).toMatch(/skipped/i);
  });

  it('drops a file whose path is nested under another file (structural collision) and notifies', () => {
    useIdeStore.getState().loadFiles([
      { path: 'Foo.java', content: 'class Foo {}' },
      { path: 'Foo.java/Bar.java', content: 'class Bar {}' },
    ]);
    const paths = useIdeStore.getState().files.map((f) => f.path);
    expect(paths).toEqual(['Foo.java']);
    expect(useModelStore.getState().notification).toMatch(/path conflicts/i);
  });

  it('loads normally when there is no collision', () => {
    useIdeStore.getState().loadFiles([
      { path: 'a/Foo.java', content: 'class Foo {}' },
      { path: 'a/Bar.java', content: 'class Bar {}' },
    ]);
    expect(useIdeStore.getState().files).toHaveLength(2);
    expect(useModelStore.getState().notification).toBeNull();
  });
});

describe('ideStore — renameFile', () => {
  beforeEach(() => {
    resetIde();
    useIdeStore.getState().loadFiles([{ path: 'a/Foo.java', content: 'package a;\npublic class Foo {}' }]);
  });

  it('rejects a new name containing a slash instead of silently nesting the file', () => {
    useIdeStore.getState().renameFile('a/Foo.java', 'a/sub/Foo.java');
    expect(useIdeStore.getState().files.map((f) => f.path)).toEqual(['a/Foo.java']);
    expect(useModelStore.getState().notification).toMatch(/can't contain/i);
  });

  it('rejects a lowercase-starting name, matching the New File dialog rule', () => {
    useIdeStore.getState().renameFile('a/Foo.java', 'a/foo.java');
    expect(useIdeStore.getState().files.map((f) => f.path)).toEqual(['a/Foo.java']);
  });

  it('rejects renaming onto an existing path', () => {
    useIdeStore.getState().addFile('a/Bar.java', 'package a;\npublic class Bar {}');
    useIdeStore.getState().renameFile('a/Foo.java', 'a/Bar.java');
    expect(useIdeStore.getState().files.find((f) => f.path === 'a/Foo.java')).toBeTruthy();
  });

  it('renames but warns when the new name no longer matches the public type declared inside', () => {
    useIdeStore.getState().renameFile('a/Foo.java', 'a/Renamed.java');
    expect(useIdeStore.getState().files.map((f) => f.path)).toEqual(['a/Renamed.java']);
    expect(useModelStore.getState().notification).toMatch(/still declares "Foo"/);
  });
});
