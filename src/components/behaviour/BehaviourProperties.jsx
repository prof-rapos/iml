import { Maximize2 } from 'lucide-react';
import { useModelStore } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';

const PANEL_BG   = '#0f172a';
const HEADER_BG  = '#1e293b';
const BORDER     = 'rgba(255,255,255,0.1)';
const TEXT       = '#f1f5f9';
const TEXT_MUTED = 'rgba(255,255,255,0.45)';
const INPUT_BG   = 'rgba(255,255,255,0.07)';

const panelStyle = {
  width: 260, background: PANEL_BG, borderLeft: `1px solid ${BORDER}`,
  display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', color: TEXT,
  fontFamily: 'var(--iml-font-sans)',
};
const headerStyle = {
  padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 13,
  background: HEADER_BG, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const inputStyle = {
  border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 4, padding: '6px 10px',
  fontSize: 13, color: TEXT, background: INPUT_BG, outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: 'var(--iml-font-sans)',
};
const codeStyle = {
  ...inputStyle,
  fontFamily: 'var(--iml-font-mono)', fontSize: 12, lineHeight: 1.5,
  minHeight: 58, resize: 'vertical', whiteSpace: 'pre', tabSize: 2,
};

// Multi-line code field with an "expand" affordance that opens the full editor.
function CodeArea({ value, placeholder, onChange, onExpand }) {
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        style={codeStyle}
        rows={3}
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        onClick={onExpand}
        title="Open in code editor"
        style={{
          position: 'absolute', top: 4, right: 4, padding: 3, lineHeight: 0,
          border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer',
          background: 'rgba(15,23,42,0.85)', color: TEXT_MUTED,
        }}
      >
        <Maximize2 size={13} />
      </button>
    </div>
  );
}
const labelStyle = {
  fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
};

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function DeleteBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)',
      borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    }}>Delete</button>
  );
}

export default function BehaviourProperties() {
  const capsuleId    = useBehaviourStore((s) => s.capsuleId);
  const selectedId   = useBehaviourStore((s) => s.selectedId);
  const selectedType = useBehaviourStore((s) => s.selectedType);
  const deleteSelected = useBehaviourStore((s) => s.deleteSelected);
  const openCodeDrawer = useBehaviourStore((s) => s.openCodeDrawer);
  const sm = useModelStore((s) => s.metaModel.behaviours?.[capsuleId]);

  const updateState      = useModelStore((s) => s.updateState);
  const updateTransition = useModelStore((s) => s.updateTransition);

  const state = selectedType === 'node' ? sm?.states.find((st) => st.id === selectedId) : null;
  const trans = selectedType === 'edge' ? sm?.transitions.find((t) => t.id === selectedId) : null;

  if (!capsuleId) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Properties</div>
        <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic', lineHeight: 1.7 }}>
          Select a capsule to model its behaviour.
        </div>
      </div>
    );
  }

  if (state && state.kind !== 'simple') {
    const isInitial = state.kind === 'initial';
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>{isInitial ? 'Initial state' : 'Final state'}</span>
          <DeleteBtn onClick={deleteSelected} />
        </div>
        <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13, lineHeight: 1.7 }}>
          {isInitial
            ? 'The initial pseudostate marks where the machine starts. Draw a transition from it to the first real state.'
            : 'The final state marks completion of the machine. Draw transitions into it for graceful exit.'}
        </div>
      </div>
    );
  }

  if (state) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>State</span>
          <DeleteBtn onClick={deleteSelected} />
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          <Field label="Name">
            <input style={inputStyle} value={state.name}
              onChange={(e) => updateState(capsuleId, state.id, { name: e.target.value })} />
          </Field>
          <Field label="Entry action">
            <CodeArea value={state.entry} placeholder={'on entry…\ncount = count + 1;'}
              onChange={(v) => updateState(capsuleId, state.id, { entry: v })}
              onExpand={() => openCodeDrawer({ scope: 'state', id: state.id, field: 'entry', title: `${state.name || 'state'} — entry` })} />
          </Field>
          <Field label="Exit action">
            <CodeArea value={state.exit} placeholder="on exit…"
              onChange={(v) => updateState(capsuleId, state.id, { exit: v })}
              onExpand={() => openCodeDrawer({ scope: 'state', id: state.id, field: 'exit', title: `${state.name || 'state'} — exit` })} />
          </Field>
        </div>
      </div>
    );
  }

  if (trans) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>Transition</span>
          <DeleteBtn onClick={deleteSelected} />
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          <Field label="Trigger">
            <input style={inputStyle} value={trans.trigger} placeholder="e.g. coinInserted"
              onChange={(e) => updateTransition(capsuleId, trans.id, { trigger: e.target.value })} />
          </Field>
          <Field label="Guard">
            <input style={inputStyle} value={trans.guard} placeholder="e.g. amount >= price"
              onChange={(e) => updateTransition(capsuleId, trans.id, { guard: e.target.value })} />
          </Field>
          <Field label="Effect">
            <CodeArea value={trans.effect} placeholder={'dispense();\nbalance = 0;'}
              onChange={(v) => updateTransition(capsuleId, trans.id, { effect: v })}
              onExpand={() => openCodeDrawer({ scope: 'transition', id: trans.id, field: 'effect', title: `${trans.trigger || 'transition'} — effect` })} />
          </Field>
          <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.6 }}>
            Shown on the arrow as <code>trigger [guard] / effect</code>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Properties</div>
      <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic', lineHeight: 1.7 }}>
        Click a state or transition to edit it.
      </div>
    </div>
  );
}
