// Shown once, at startup, only when the last autosave snapshot's own
// `dirty` flag was true — i.e. there was genuinely unsaved work in progress
// the moment the app last closed/crashed/refreshed. Never restores
// automatically: an autosave is a background safety net the user didn't
// explicitly ask to load, so a silent restore risks surprising someone who
// deliberately wanted a blank slate right after a refresh they meant to do.
function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

export default function RestorePrompt({ savedAt, onRestore, onDiscard }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
    }}>
      <div style={{
        background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '24px 28px', maxWidth: 380, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        color: '#f1f5f9', fontFamily: 'var(--iml-font-sans)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Restore unsaved work?</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', marginBottom: 20 }}>
          We found work from {timeAgo(savedAt)} that wasn't saved before your last session ended
          — likely an accidental refresh or closed tab. Restore it, or start fresh?
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onDiscard} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)',
            color: '#f1f5f9', fontWeight: 600,
          }}>
            Start Fresh
          </button>
          <button onClick={onRestore} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: 'none', background: '#2563eb',
            color: '#fff', fontWeight: 600,
          }}>
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}
