import { Code2 } from 'lucide-react';
import { useModelStore } from '../store/modelStore';
import { AllSidesHandles } from './nodeShell';

const ACCENT_NORMAL   = 'var(--iml-primary)'; // blue  — normal
const ACCENT_SELECTED = '#d97706';            // orange — selected

const handleStyle = {
  width: 9, height: 9,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
};

// One-line preview of an action; a code icon signals more lines exist.
function ActionLine({ label, code }) {
  const lines = code.split('\n').filter((l) => l.trim() !== '');
  const first = lines[0] ?? '';
  const shown = first.length > 24 ? `${first.slice(0, 24)}…` : first;
  const multi = lines.length > 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ opacity: 0.55 }}>{label} /</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
      {multi && <Code2 size={12} style={{ opacity: 0.7, flexShrink: 0 }} aria-label="multiple lines" />}
    </div>
  );
}

export default function StateNode({ id, data, selected }) {
  const state = useModelStore((s) => s.metaModel.behaviours?.[data.capsuleId]?.states.find((st) => st.id === id));
  if (!state) return null;

  const accent = selected ? ACCENT_SELECTED : ACCENT_NORMAL;
  const hasActions = state.entry || state.exit;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${accent}`,
        borderRadius: 12,
        minWidth: 120,
        fontFamily: 'var(--iml-font-sans)',
        boxShadow: selected ? '0 0 0 3px rgba(217,119,6,0.25)' : '0 2px 6px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{
        background: accent,
        padding: hasActions ? '6px 12px' : '10px 14px',
        color: '#fff', fontWeight: 600, fontSize: 13, textAlign: 'center',
        whiteSpace: 'pre-wrap',
      }}>
        {state.name || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(unnamed)</span>}
      </div>

      {hasActions && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: '#cbd5e1', fontFamily: 'var(--iml-font-mono)', maxWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {state.entry && <ActionLine label="entry" code={state.entry} />}
          {state.exit  && <ActionLine label="exit"  code={state.exit} />}
        </div>
      )}

      <AllSidesHandles style={handleStyle} />
    </div>
  );
}
