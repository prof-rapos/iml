import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useModelStore, allProtocols } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';
import ProtocolManager from './ProtocolManager';
import { TEXT, TEXT_DIM } from '../theme';

const BORDER   = 'rgba(255,255,255,0.10)';
const ACCENT   = '#d97706';

function PaletteBtn({ label, glyph, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: '2px 8px', padding: '8px 10px', borderRadius: 5,
        border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.05)',
        color: disabled ? TEXT_DIM : TEXT, fontSize: 12, textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        fontFamily: 'var(--iml-font-sans)',
      }}
    >
      {glyph}
      {label}
    </button>
  );
}

const smallInput = {
  background: '#0f172a', border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 4, padding: '3px 6px', fontSize: 11, outline: 'none', width: '100%', boxSizing: 'border-box',
};

function PortRow({ classId, port, protocols, updatePort, deletePort }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 5, padding: 6, margin: '0 8px 5px' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <input style={{ ...smallInput, flex: 1 }} value={port.name}
          onChange={(e) => updatePort(classId, port.id, { name: e.target.value })} />
        <button onClick={() => deletePort(classId, port.id)}
          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
      </div>
      <select style={{ ...smallInput, cursor: 'pointer', marginBottom: 4 }} value={port.protocolId ?? ''}
        onChange={(e) => updatePort(classId, port.id, { protocolId: e.target.value })}>
        {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}{p.system ? ' (system)' : ''}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: TEXT_DIM, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!port.conjugated}
          onChange={(e) => updatePort(classId, port.id, { conjugated: e.target.checked })} />
        conjugated (flip in/out)
      </label>
    </div>
  );
}

export default function BehaviourSidebar() {
  const capsuleId = useBehaviourStore((s) => s.capsuleId);
  const addState  = useBehaviourStore((s) => s.addState);
  const viewport  = useBehaviourStore((s) => s.viewport);
  const metaModel = useModelStore((s) => s.metaModel);
  const addPort    = useModelStore((s) => s.addPort);
  const updatePort = useModelStore((s) => s.updatePort);
  const deletePort = useModelStore((s) => s.deletePort);

  const [protoOpen, setProtoOpen] = useState(false);

  const sm  = metaModel.behaviours?.[capsuleId];
  const cls = metaModel.classes.find((c) => c.id === capsuleId);
  const protocols = allProtocols(metaModel);
  const hasInitial = !!sm?.states.some((st) => st.kind === 'initial');
  const disabled   = !capsuleId;

  const spawnPosition = () => {
    const count = sm?.states.length ?? 0;
    const el = document.querySelector('.react-flow');
    const cw = el ? el.clientWidth  : 600;
    const ch = el ? el.clientHeight : 500;
    const cx = (cw / 2 - viewport.x) / viewport.zoom;
    const cy = (ch / 2 - viewport.y) / viewport.zoom;
    const step = (count % 8) * 28;
    return { x: cx - 60 + step, y: cy - 30 + step };
  };
  const add = (kind) => addState(kind, spawnPosition());

  return (
    <div style={{
      width: 200, flexShrink: 0, background: '#1e293b', borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)', overflowY: 'auto',
    }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Palette
      </div>

      <PaletteBtn label="State"
        glyph={<span style={{ width: 14, height: 11, borderRadius: 3, border: `2px solid ${ACCENT}`, flexShrink: 0 }} />}
        onClick={() => add('simple')} disabled={disabled} />
      <PaletteBtn label={hasInitial ? 'Initial (added)' : 'Initial State'}
        glyph={<span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />}
        onClick={() => add('initial')} disabled={disabled || hasInitial} />
      <PaletteBtn label="Final State"
        glyph={<span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #e2e8f0', boxShadow: 'inset 0 0 0 2px #1e293b, inset 0 0 0 3px #e2e8f0', flexShrink: 0 }} />}
        onClick={() => add('final')} disabled={disabled} />

      {/* ── Capsule ports ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px 6px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ports</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setProtoOpen(true)} title="Manage protocols"
          style={{ background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', padding: 2, lineHeight: 0 }}>
          <Settings2 size={14} />
        </button>
      </div>

      {disabled ? (
        <div style={{ margin: '0 12px 8px', fontSize: 11, color: TEXT_DIM, fontStyle: 'italic' }}>Select a capsule first.</div>
      ) : (
        <>
          {(cls?.ports ?? []).length === 0 && (
            <div style={{ margin: '0 12px 6px', fontSize: 11, color: TEXT_DIM, fontStyle: 'italic' }}>No ports yet.</div>
          )}
          {(cls?.ports ?? []).map((port) => (
            <PortRow key={port.id} classId={capsuleId} port={port} protocols={protocols} updatePort={updatePort} deletePort={deletePort} />
          ))}
          <button onClick={() => addPort(capsuleId)}
            style={{ margin: '2px 8px 8px', padding: '6px', borderRadius: 5, border: `1px dashed ${BORDER}`, background: 'transparent', color: '#79c0ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Add Port
          </button>
        </>
      )}

      <div style={{ margin: '6px 12px 12px', fontSize: 11, color: TEXT_DIM, lineHeight: 1.6 }}>
        {disabled
          ? 'Pick a capsule above to edit its state machine.'
          : 'Drag from a state handle (●) to add a transition. A transition’s trigger picks from its ports’ receivable messages.'}
      </div>

      {protoOpen && <ProtocolManager onClose={() => setProtoOpen(false)} />}
    </div>
  );
}
