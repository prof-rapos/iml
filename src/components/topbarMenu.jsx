import { useState } from 'react';

// Shared pieces of the hamburger dropdown menu used by Topbar, IDETopbar,
// and BehaviourTopbar, plus the home button all three (and TransformTopbar)
// link back to the landing page with.

export function MenuSection({ label }) {
  return (
    <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
      {label}
    </div>
  );
}

export function MenuDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />;
}

export function MenuItem({ children, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '9px 14px', fontSize: 13, fontWeight: 500,
        background: hover && !disabled ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: disabled ? 'rgba(255,255,255,0.35)' : '#f1f5f9',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function HomeButton({ onClick, size = 36, borderColor = 'rgba(255,255,255,0.15)', color = '#f1f5f9' }) {
  return (
    <button
      onClick={onClick}
      title="Home"
      style={{
        width: size, height: size, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${borderColor}`,
        background: 'rgba(255,255,255,0.07)',
        color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
      </svg>
    </button>
  );
}
