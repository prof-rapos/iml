import { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';

const TEXT_DIM = '#8b949e';

export default function CodeEditor({ files, activeFilePath, onContentChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const modelsRef = useRef({});

  const activeFile = files.find((f) => f.path === activeFilePath);

  function syncModels(files, monaco) {
    const currentPaths = new Set(files.map((f) => f.path));

    for (const f of files) {
      const existing = modelsRef.current[f.path];
      if (!existing) {
        const uri = monaco.Uri.parse(`file:///${f.path}`);
        const existingMonacoModel = monaco.editor.getModel(uri);
        modelsRef.current[f.path] = existingMonacoModel ?? monaco.editor.createModel(f.content, 'java', uri);
      } else if (existing.getValue() !== f.content) {
        // The path is already cached but its content changed underneath us —
        // e.g. a reimported project reuses a path from the one just closed.
        // Refresh the model instead of leaving the editor showing stale text.
        existing.setValue(f.content);
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
