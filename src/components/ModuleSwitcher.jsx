import { useState, useRef } from 'react';
import { useModelStore } from '../store/modelStore';
import { useOutsideClick } from '../utils/useOutsideClick';
import { GROUPS, moduleIcon } from '../utils/moduleGroups.jsx';

// Shared "jump to another module" control for every module's own topbar —
// there was previously no way to move between modules without going back to
// the landing page first, even though Structural <-> Behavioural especially
// gets switched between constantly while modeling. Reuses the exact same
// grouping (LandingPage's GROUPS) so the two places the module list appears
// never drift apart.
export default function ModuleSwitcher({ current, size = 36, borderColor = 'rgba(255,255,255,0.15)', color = '#f1f5f9' }) {
  const setAppView = useModelStore((s) => s.setAppView);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch module"
        style={{
          height: size, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${borderColor}`,
          background: open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
          color, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        <span>Modules</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', minWidth: 250, overflow: 'hidden',
          padding: '6px 0',
        }}>
          {GROUPS.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />}
              <div style={{ padding: '4px 12px 2px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>
                {group.label}
              </div>
              {group.modules.map((mod) => {
                const isCurrent = mod.id === current;
                return (
                  <button
                    key={mod.id}
                    onClick={() => { if (!isCurrent) { setAppView(mod.id); setOpen(false); } }}
                    disabled={isCurrent}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                      padding: '7px 12px', background: isCurrent ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: 'none', cursor: isCurrent ? 'default' : 'pointer',
                      color: isCurrent ? 'rgba(255,255,255,0.4)' : '#f1f5f9', fontSize: 13, fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                    onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ color: mod.color, display: 'flex', flexShrink: 0 }}>{moduleIcon(mod.id, 15)}</span>
                    <span>{mod.title}</span>
                    {isCurrent && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>current</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
