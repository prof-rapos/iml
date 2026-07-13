import { useRef, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useModelStore, capsuleCompletions } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';

const BORDER = 'rgba(255,255,255,0.12)';

const KIND = { method: 'Function', field: 'Field', variable: 'Variable' };

// Registers a completion provider that offers the capsule's ports, their
// signals (after `port.`), and its attributes. Reads live store state so it
// always reflects the current capsule. Returns a disposer.
function registerCompletions(monaco) {
  return monaco.languages.registerCompletionItemProvider('java', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const capsuleId = useBehaviourStore.getState().capsuleId;
      const metaModel = useModelStore.getState().metaModel;
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const suggestions = capsuleCompletions(capsuleId, metaModel, line).map((c) => ({
        label: c.label,
        kind: monaco.languages.CompletionItemKind[KIND[c.kind] ?? 'Text'],
        insertText: c.insert,
        detail: c.detail,
        range,
      }));
      return { suggestions };
    },
  });
}

// Bottom drawer giving a full Monaco editor for a state/transition code field.
// Opened from the properties panel's expand affordance; edits bind straight to
// updateState / updateTransition, so there is no separate draft state.
export default function CodeDrawer() {
  const capsuleId        = useBehaviourStore((s) => s.capsuleId);
  const drawer           = useBehaviourStore((s) => s.codeDrawer);
  const close            = useBehaviourStore((s) => s.closeCodeDrawer);
  const updateState      = useModelStore((s) => s.updateState);
  const updateTransition = useModelStore((s) => s.updateTransition);
  const metaModel        = useModelStore((s) => s.metaModel);
  const sm               = metaModel.behaviours?.[capsuleId];

  const ref = useRef(null);
  const providerRef = useRef(null);
  // Close when focus/click moves outside the drawer. Capture phase is required
  // because React Flow stops mousedown propagation on the canvas, so a bubble
  // listener would never see clicks on the diagram itself.
  useEffect(() => {
    if (!drawer) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [drawer, close]);
  // Dispose the completion provider when the drawer unmounts.
  useEffect(() => () => { providerRef.current?.dispose(); providerRef.current = null; }, []);

  const handleMount = (editor, monaco) => {
    providerRef.current?.dispose();
    providerRef.current = registerCompletions(monaco);
  };

  if (!drawer) return null;

  const el = drawer.scope === 'state'
    ? sm?.states.find((x) => x.id === drawer.id)
    : sm?.transitions.find((x) => x.id === drawer.id);
  if (!el) return null; // target was deleted while open

  const value = el[drawer.field] ?? '';
  const onChange = (v) => {
    const patch = { [drawer.field]: v ?? '' };
    if (drawer.scope === 'state') updateState(capsuleId, drawer.id, patch);
    else updateTransition(capsuleId, drawer.id, patch);
  };

  const ports = metaModel.classes.find((c) => c.id === capsuleId)?.ports ?? [];

  return (
    <div
      ref={ref}
      onKeyDown={(e) => e.stopPropagation()}  // keep keys (Space, Delete…) out of React Flow
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%',
        background: '#0d1117', borderTop: `1px solid ${BORDER}`,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.45)', zIndex: 50,
        display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)',
      }}
    >
      <div style={{
        height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', background: '#161b22', borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Code Editor
        </span>
        <span style={{ fontSize: 12, color: '#e6edf3' }}>{drawer.title}</span>
        <span style={{ fontSize: 11, color: '#6e7681' }}>· Java</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={close}
          title="Close editor"
          style={{
            border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.07)', color: '#e6edf3',
            borderRadius: 5, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}
        >
          Done
        </button>
      </div>

      {/* Capsule interface reference — students write sends as port.signal(...) */}
      <div style={{
        flexShrink: 0, padding: '5px 12px', background: '#0d1117', borderBottom: `1px solid ${BORDER}`,
        fontSize: 11, color: '#6e7681', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>ports</span>
        {ports.length === 0
          ? <span style={{ fontStyle: 'italic' }}>none — add ports in the sidebar</span>
          : ports.map((p) => (
              <span key={p.id} style={{ color: '#9cd1ff', background: 'rgba(121,192,255,0.1)', borderRadius: 3, padding: '1px 6px', fontFamily: 'var(--iml-font-mono)' }}>{p.name}</span>
            ))}
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>Ctrl+Space for completions</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          key={`${drawer.scope}:${drawer.id}:${drawer.field}`}
          height="100%"
          defaultLanguage="java"
          theme="vs-dark"
          value={value}
          onMount={handleMount}
          onChange={onChange}
          options={{
            fontSize: 13, tabSize: 2, insertSpaces: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false, automaticLayout: true,
            wordWrap: 'on', renderLineHighlight: 'all', smoothScrolling: true,
            lineNumbersMinChars: 3, padding: { top: 10 },
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace',
          }}
        />
      </div>
    </div>
  );
}
