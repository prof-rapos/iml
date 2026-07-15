// Shared component for the right-hand properties panels — kept in its own
// file (separate from panelShellTokens.js) so Fast Refresh only sees a
// component export here, per react-refresh/only-export-components.
export function DeleteBtn({ onClick, label = 'Delete' }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(220,38,38,0.15)', color: '#fca5a5',
      border: '1px solid rgba(220,38,38,0.3)', borderRadius: 4,
      padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    }}>
      {label}
    </button>
  );
}
