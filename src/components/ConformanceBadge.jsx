import { useState, useRef } from 'react';
import { useModelStore } from '../store/modelStore';
import { useOutsideClick } from '../utils/useOutsideClick';

// Conformance badge + popover, shared by Structural's Sidebar and Behavioural's
// BehaviourSidebar — extracted so Generate's silent conformance-gate block
// (useGenerateMenu.jsx) always has a visible list of *why* somewhere on
// screen, not just Structural's. `extraWarnings` is Structural-only
// (co-evolution/orphaned-attribute warnings); Behavioural has none.
export default function ConformanceBadge({ extraWarnings = [] }) {
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  const [issueOpen, setIssueOpen] = useState(false);
  const issueRef = useRef(null);
  useOutsideClick(issueRef, () => setIssueOpen(false), issueOpen);

  const hasIssues  = conformanceResults.length > 0 || extraWarnings.length > 0;
  const totalCount = conformanceResults.length + extraWarnings.length;
  const badge = hasIssues
    ? { bg: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: 'rgba(245,158,11,0.5)' }
    : { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' };

  return (
    <div ref={issueRef} style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px', position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => hasIssues && setIssueOpen((o) => !o)}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 20,
          border: `1px solid ${badge.border}`,
          background: badge.bg, color: badge.color,
          fontSize: 12, fontWeight: 700, cursor: hasIssues ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          letterSpacing: '0.03em',
        }}
      >
        {hasIssues
          ? <><span>⚠ {totalCount} Conformance Issue{totalCount > 1 ? 's' : ''}</span><span style={{ opacity: 0.7, fontSize: 11 }}>›</span></>
          : <span>✓ Valid Conformance</span>
        }
      </button>

      {issueOpen && hasIssues && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 8, right: 8, zIndex: 300,
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            Conformance Issues
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 12px 10px', fontFamily: 'var(--iml-font-mono)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {extraWarnings.map((w, i) => (
              <div key={`ce-${i}`} style={{ color: '#93c5fd' }}>↳ {w}</div>
            ))}
            {conformanceResults.map((r, i) => (
              <div key={i} style={{ color: '#fca5a5' }}>⚠ {r.msg}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
