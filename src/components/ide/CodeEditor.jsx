import { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { TEXT_DIM } from '../theme';

export default function CodeEditor({ files, activeFilePath, onContentChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const modelsRef = useRef({});

  const activeFile = files.find((f) => f.path === activeFilePath);

  function syncModels(files, monaco) {
    const currentPaths = new Set(files.map((f) => f.path));

    for (const f of files) {
      let model = modelsRef.current[f.path];
      if (!model) {
        const uri = monaco.Uri.parse(`file:///${f.path}`);
        // A remounted CodeEditor (e.g. leaving and re-entering the IDE view)
        // starts with an empty modelsRef, but Monaco's own model registry is
        // global and never got disposed — it can still hold a stale model
        // for this path from a previous generation. Reusing it without a
        // content check silently shows old code after a regenerate.
        model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(f.content, 'java', uri);
        modelsRef.current[f.path] = model;
      }
      if (model.getValue() !== f.content) {
        // The model is already cached but its content changed underneath us —
        // e.g. a reimported/regenerated project reuses a path from before.
        // Refresh the model instead of leaving the editor showing stale text.
        model.setValue(f.content);
      }
    }

    // Dispose models for deleted files
    for (const path of Object.keys(modelsRef.current)) {
      if (!currentPaths.has(path)) {
        modelsRef.current[path]?.dispose();
        delete modelsRef.current[path];
      }
    }
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Create Monaco models for all current files
    syncModels(files, monaco);

    // Set the active model
    if (activeFilePath) {
      const model = modelsRef.current[activeFilePath];
      if (model) editor.setModel(model);
    }

    editor.onDidChangeModelContent(() => {
      const currentPath = getCurrentPath(editor, modelsRef.current);
      if (currentPath) onContentChange(currentPath, editor.getValue());
    });
  }

  // Sync Monaco models when files change
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    syncModels(files, monaco);
  }, [files]);

  // Switch model when activeFilePath changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFilePath) return;
    const model = modelsRef.current[activeFilePath];
    if (model && editor.getModel() !== model) {
      editor.setModel(model);
    }
  }, [activeFilePath]);

  if (!activeFile) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d1117', color: TEXT_DIM, fontSize: 13,
      }}>
        Open a file from the tree to start editing
      </div>
    );
  }

  return (
    <MonacoEditor
      height="100%"
      defaultLanguage="java"
      theme="vs-dark"
      onMount={handleEditorMount}
      options={{
        fontSize: 14,
        tabSize: 4,
        insertSpaces: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'off',
        renderLineHighlight: 'all',
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        fontLigatures: true,
        fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace',
      }}
    />
  );
}

function getCurrentPath(editor, modelsRef) {
  const model = editor.getModel();
  if (!model) return null;
  const uri = model.uri.toString();
  return Object.entries(modelsRef).find(([, m]) => m?.uri?.toString() === uri)?.[0] ?? null;
}
