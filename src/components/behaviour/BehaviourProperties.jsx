import { Maximize2 } from 'lucide-react';
import { useModelStore, capsuleMessages, getProtocolById } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';
import { BORDER, TEXT, TEXT_MUTED, panelStyle, headerStyle } from '../panelShellTokens';
import { DeleteBtn } from '../panelShell';

const INPUT_BG   = 'rgba(255,255,255,0.07)';

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


export default function BehaviourProperties() {
  const capsuleId    = useBehaviourStore((s) => s.capsuleId);
  const selectedId   = useBehaviourStore((s) => s.selectedId);
  const selectedType = useBehaviourStore((s) => s.selectedType);
  const deleteSelected = useBehaviourStore((s) => s.deleteSelected);
  const openCodeDrawer = useBehaviourStore((s) => s.openCodeDrawer);
  const metaModel = useModelStore((s) => s.metaModel);
  const sm = metaModel.behaviours?.[capsuleId];

  const updateState      = useModelStore((s) => s.updateState);
  const updateTransition = useModelStore((s) => s.updateTransition);

  const messages = capsuleId ? capsuleMessages(capsuleId, metaModel) : [];

  // Look up the params for a "port.signal" trigger string, for a read-only hint.
  const triggerParams = (trigger) => {
    if (!trigger) return null;
    const [portName, sigName] = trigger.split('.');
    if (!portName || !sigName) return null;
    const cls = metaModel.classes.find((c) => c.id === capsuleId);
    const port = (cls?.ports ?? []).find((p) => p.name === portName);
    if (!port) return null;
    const proto = getProtocolById(port.protocolId, metaModel);
    const sig = proto?.signals.find((s) => s.name === sigName);
    return sig?.params ?? null;
  };

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
    const srcState = sm?.states.find((st) => st.id === trans.source);
    const fromInitial = srcState?.kind === 'initial';
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>Transition</span>
          <DeleteBtn onClick={deleteSelected} />
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          <Field label="Trigger">
            {messages.length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) updateTransition(capsuleId, trans.id, { trigger: e.target.value }); }}
                style={{ ...inputStyle, cursor: 'pointer', marginBottom: 5, background: '#1e293b' }}
              >
                <option value="">insert a message…</option>
                {messages.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            )}
            <input style={inputStyle} value={trans.trigger}
              placeholder={messages.length ? 'trigger (or pick above)' : 'e.g. timer.timeout — add ports below'}
              onChange={(e) => updateTransition(capsuleId, trans.id, { trigger: e.target.value })} />
            {(() => {
              const params = triggerParams(trans.trigger);
              return params && params.length > 0 ? (
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                  params: {params.map((p) => `${p.name}: ${p.type}`).join(', ')}
                </div>
              ) : null;
            })()}
          </Field>
          <Field label="Guard">
            {fromInitial ? (
              <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
                The initial transition always fires unconditionally — it can't have a guard.
              </div>
            ) : (
              <input style={inputStyle} value={trans.guard} placeholder="e.g. amount >= price"
                onChange={(e) => updateTransition(capsuleId, trans.id, { guard: e.target.value })} />
            )}
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
