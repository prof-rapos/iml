import MonacoEditor from '@monaco-editor/react';
import { useModelStore } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';

const BORDER = 'rgba(255,255,255,0.12)';

// Bottom drawer giving a full Monaco editor for a state/transition code field.
// Opened from the properties panel's expand affordance; edits bind straight to
// updateState / updateTransition, so there is no separate draft state.
export default function CodeDrawer() {
  const capsuleId        = useBehaviourStore((s) => s.capsuleId);
  const drawer           = useBehaviourStore((s) => s.codeDrawer);
  const close            = useBehaviourStore((s) => s.closeCodeDrawer);
  const updateState      = useModelStore((s) => s.updateState);
  const updateTransition = useModelStore((s) => s.updateTransition);
  const sm               = useModelStore((s) => s.metaModel.behaviours?.[capsuleId]);

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

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%',
      background: '#0d1117', borderTop: `1px solid ${BORDER}`,
      boxShadow: '0 -8px 24px rgba(0,0,0,0.45)', zIndex: 50,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)',
    }}>
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

      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          key={`${drawer.scope}:${drawer.id}:${drawer.field}`}
          height="100%"
          defaultLanguage="java"
          theme="vs-dark"
          value={value}
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
