import { useModelStore } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';

const TEXT     = '#e6edf3';
const TEXT_DIM = '#8b949e';
const BORDER   = 'rgba(255,255,255,0.10)';

export default function BehaviourTopbar() {
  const classes    = useModelStore((s) => s.metaModel.classes);
  const setAppView = useModelStore((s) => s.setAppView);
  const capsuleId  = useBehaviourStore((s) => s.capsuleId);
  const setCapsule = useBehaviourStore((s) => s.setCapsule);

  return (
    <div style={{
      height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 16px', background: '#161b22', borderBottom: `1px solid ${BORDER}`,
      fontFamily: 'var(--iml-font-sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: '#fff', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <img src={`${import.meta.env.BASE_URL}logos/logo.png`} alt="IML" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Behavioural Modeling</span>
      </div>

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      <span style={{ fontSize: 12, color: TEXT_DIM }}>Capsule</span>
      <select
        value={capsuleId ?? ''}
        onChange={(e) => setCapsule(e.target.value || null)}
        style={{
          background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
          borderRadius: 5, padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 160,
        }}
      >
        <option value="">— select a class —</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.isAbstract ? ' «abstract»' : ''}</option>
        ))}
      </select>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setAppView('home')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
        title="Back to home"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
        </svg>
      </button>
    </div>
  );
}
