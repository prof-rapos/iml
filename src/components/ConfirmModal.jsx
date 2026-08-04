// Shared confirmation dialog — extracted from Sidebar.jsx (originally used
// only for "Clear Meta-Model") so other destructive/lossy actions elsewhere
// in the app (e.g. PropertiesPanel's attribute-narrowing warning) get the
// same look instead of a second hand-rolled modal or a native confirm().
export default function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Confirm' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
    }}
      onClick={onCancel}
    >
      <div style={{
        background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '24px 28px', maxWidth: 340, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        color: '#f1f5f9', fontFamily: 'var(--iml-font-sans)',
      }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)',
            color: '#f1f5f9', fontWeight: 600,
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: 'none', background: '#dc2626',
            color: '#fff', fontWeight: 600,
          }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
