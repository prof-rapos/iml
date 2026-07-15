// Shared dark-theme tokens for the right-hand properties panels (Structural,
// Behavioural state machine, Capsule structure) — these were independently
// redefined identically in all three; this is the one place to change them.
export const PANEL_BG   = '#0f172a';
export const HEADER_BG  = '#1e293b';
export const BORDER     = 'rgba(255,255,255,0.1)';
export const TEXT       = '#f1f5f9';
export const TEXT_MUTED = 'rgba(255,255,255,0.45)';

export const panelStyle = {
  width: 260, background: PANEL_BG, borderLeft: `1px solid ${BORDER}`,
  display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
  color: TEXT, fontFamily: 'var(--iml-font-sans)',
};
export const headerStyle = {
  padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
  fontWeight: 600, fontSize: 13, color: TEXT, background: HEADER_BG,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexShrink: 0,
};
