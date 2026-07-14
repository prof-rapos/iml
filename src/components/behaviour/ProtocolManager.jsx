import { useModelStore, SYSTEM_PROTOCOLS } from '../../store/modelStore';

const TEXT     = '#e6edf3';
const TEXT_DIM = '#8b949e';
const BORDER   = 'rgba(255,255,255,0.10)';
const CARD_BG  = '#161b22';

const input = {
  background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 4, padding: '4px 8px', fontSize: 12, outline: 'none',
  fontFamily: 'var(--iml-font-sans)',
};
const select = { ...input, cursor: 'pointer' };

function ParamRow({ protocolId, sig, param, actions, enumerations, readOnly }) {
  const typeValue = param.type === 'ENUM' ? `enum:${param.enumId}` : param.type;
  const onTypeChange = (raw) => {
    if (raw.startsWith('enum:')) actions.updateParam(protocolId, sig.id, param.id, { type: 'ENUM', enumId: raw.slice(5) });
    else actions.updateParam(protocolId, sig.id, param.id, { type: raw, enumId: undefined });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, marginLeft: 16 }}>
      <input
        style={{ ...input, flex: 1, fontSize: 11, opacity: readOnly ? 0.6 : 1 }}
        value={param.name} disabled={readOnly}
        onChange={(e) => actions.updateParam(protocolId, sig.id, param.id, { name: e.target.value })}
      />
      <select
        style={{ ...select, width: 84, fontSize: 11, opacity: readOnly ? 0.6 : 1 }}
        value={typeValue} disabled={readOnly}
        onChange={(e) => onTypeChange(e.target.value)}
      >
        {['STRING', 'INT', 'DOUBLE', 'BOOLEAN'].map((t) => <option key={t} value={t}>{t}</option>)}
        {enumerations.length > 0 && (
          <optgroup label="Enumerations">
            {enumerations.map((en) => <option key={en.id} value={`enum:${en.id}`}>{en.name}</option>)}
          </optgroup>
        )}
      </select>
      {!readOnly && (
        <button onClick={() => actions.deleteParam(protocolId, sig.id, param.id)}
          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
      )}
    </div>
  );
}

function SignalRow({ protocolId, sig, actions, enumerations, readOnly }) {
  const params = sig.params ?? [];
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <input
          style={{ ...input, flex: 1, opacity: readOnly ? 0.6 : 1 }}
          value={sig.name} disabled={readOnly}
          onChange={(e) => actions.updateSignal(protocolId, sig.id, { name: e.target.value })}
        />
        <select
          style={{ ...select, width: 66, opacity: readOnly ? 0.6 : 1 }}
          value={sig.direction} disabled={readOnly}
          onChange={(e) => actions.updateSignal(protocolId, sig.id, { direction: e.target.value })}
        >
          <option value="in">in</option>
          <option value="out">out</option>
        </select>
        {!readOnly && (
          <button onClick={() => actions.deleteSignal(protocolId, sig.id)}
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        )}
      </div>
      {params.map((param) => (
        <ParamRow key={param.id} protocolId={protocolId} sig={sig} param={param} actions={actions} enumerations={enumerations} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button onClick={() => actions.addParam(protocolId, sig.id)}
          style={{ marginLeft: 16, background: 'none', border: 'none', color: '#79c0ff', fontSize: 11, cursor: 'pointer', padding: 0 }}>
          + param
        </button>
      )}
    </div>
  );
}

function ProtocolCard({ proto, actions, enumerations }) {
  const readOnly = !!proto.system;
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          style={{ ...input, fontWeight: 700, flex: 1, opacity: readOnly ? 0.7 : 1 }}
          value={proto.name} disabled={readOnly}
          onChange={(e) => actions.updateProtocol(proto.id, { name: e.target.value })}
        />
        {readOnly
          ? <span style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em' }}>system</span>
          : <button onClick={() => actions.deleteProtocol(proto.id)}
              style={{ background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Delete</button>}
      </div>

      <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Signals</div>
      {proto.signals.length === 0 && <div style={{ fontSize: 12, color: TEXT_DIM, fontStyle: 'italic', marginBottom: 6 }}>No signals.</div>}
      {proto.signals.map((sig) => (
        <SignalRow key={sig.id} protocolId={proto.id} sig={sig} actions={actions} enumerations={enumerations} readOnly={readOnly} />
      ))}
      {!readOnly && (
        <button onClick={() => actions.addSignal(proto.id, 'in')}
          style={{ marginTop: 4, background: 'none', border: `1px dashed ${BORDER}`, borderRadius: 4, color: '#79c0ff', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
          + Add signal
        </button>
      )}
    </div>
  );
}

export default function ProtocolManager({ onClose }) {
  const protocols       = useModelStore((s) => s.metaModel.protocols) ?? [];
  const enumerations    = useModelStore((s) => s.metaModel.enumerations) ?? [];
  const addProtocol     = useModelStore((s) => s.addProtocol);
  const updateProtocol  = useModelStore((s) => s.updateProtocol);
  const deleteProtocol  = useModelStore((s) => s.deleteProtocol);
  const addSignal       = useModelStore((s) => s.addSignal);
  const updateSignal    = useModelStore((s) => s.updateSignal);
  const deleteSignal    = useModelStore((s) => s.deleteSignal);
  const addParam        = useModelStore((s) => s.addParam);
  const updateParam     = useModelStore((s) => s.updateParam);
  const deleteParam     = useModelStore((s) => s.deleteParam);
  const actions = { updateProtocol, deleteProtocol, addSignal, updateSignal, deleteSignal, addParam, updateParam, deleteParam };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 10, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)', color: TEXT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Protocols</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_DIM, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.5 }}>
            A protocol is a named set of message signals. Ports on a capsule are typed by a protocol; a capsule is triggered by the signals its ports can receive.
          </div>
          {SYSTEM_PROTOCOLS.map((p) => <ProtocolCard key={p.id} proto={p} actions={actions} enumerations={enumerations} />)}
          {protocols.map((p) => <ProtocolCard key={p.id} proto={p} actions={actions} enumerations={enumerations} />)}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}` }}>
          <button onClick={addProtocol}
            style={{ width: '100%', padding: '8px', borderRadius: 6, background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', color: '#fcd9a8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + New Protocol
          </button>
        </div>
      </div>
    </div>
  );
}
