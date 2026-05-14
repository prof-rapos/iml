import { useModelStore } from '../store/modelStore';

export default function Notification() {
  const notification = useModelStore((s) => s.notification);

  if (!notification) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: '#1e293b',
      border: '1px solid rgba(251,191,36,0.5)',
      borderLeft: '3px solid #f59e0b',
      borderRadius: 8,
      padding: '10px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      maxWidth: 480,
      pointerEvents: 'none',
    }}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="#f59e0b" style={{ flexShrink: 0 }}>
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.4 }}>{notification}</span>
    </div>
  );
}
