import { TEXT, TEXT_DIM } from '../theme';

const BG = '#161b22';
const BORDER = 'rgba(255,255,255,0.12)';
const ACCENT = '#2563eb';

export default function OverwriteConfirmDialog({ onExportAndProceed, onProceed, onCancel }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '28px 28px 22px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: TEXT, fontFamily: 'var(--iml-font-sans)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Replace current project?</div>
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.6, marginBottom: 24 }}>
          The IDE already has an open project. Opening the generated code will replace it.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onExportAndProceed} style={{
            padding: '9px 16px', borderRadius: 6, border: `1px solid ${BORDER}`,
            background: 'rgba(255,255,255,0.06)', color: TEXT, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          }}>
            Export current project as ZIP, then replace
          </button>
          <button onClick={onProceed} style={{
            padding: '9px 16px', borderRadius: 6, border: `1px solid ${BORDER}`,
            background: 'rgba(255,255,255,0.06)', color: TEXT, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          }}>
            Replace without saving
          </button>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 6, border: `1px solid ${ACCENT}`,
            background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
