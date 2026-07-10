import { useModelStore } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';

const TEXT     = '#e6edf3';
const TEXT_DIM = '#8b949e';
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

export default function BehaviourSidebar() {
  const capsuleId = useBehaviourStore((s) => s.capsuleId);
  const addState  = useBehaviourStore((s) => s.addState);
  const sm        = useModelStore((s) => s.metaModel.behaviours?.[capsuleId]);

  const hasInitial = !!sm?.states.some((st) => st.kind === 'initial');
  const disabled   = !capsuleId;

  return (
    <div style={{
      width: 190, flexShrink: 0, background: '#1e293b', borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)',
    }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Palette
      </div>

      <PaletteBtn
        label="State"
        glyph={<span style={{ width: 14, height: 11, borderRadius: 3, border: `2px solid ${ACCENT}`, flexShrink: 0 }} />}
        onClick={() => addState('simple')}
        disabled={disabled}
      />
      <PaletteBtn
        label={hasInitial ? 'Initial (added)' : 'Initial State'}
        glyph={<span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />}
        onClick={() => addState('initial')}
        disabled={disabled || hasInitial}
      />

      <div style={{ margin: '10px 12px', fontSize: 11, color: TEXT_DIM, lineHeight: 1.6 }}>
        {disabled
          ? 'Pick a capsule above to edit its state machine.'
          : 'Drag from a state handle (●) to another state to add a transition. Select an element and press Delete to remove it.'}
      </div>
    </div>
  );
}
