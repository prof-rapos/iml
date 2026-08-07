import { useState } from 'react';
import { useOverlayClose } from '../utils/useOverlayClose';
import { TEXT, TEXT_DIM } from './theme';

const BORDER = 'rgba(255,255,255,0.10)';

// Shared by the Model Transformations summary report ("reduced" mode — just
// the title-page fields, every section is always included) and the full
// meta-model "Generate Report" (adds one checkbox per section, all checked
// by default) — same overlay/card/header shell as LoadExampleModal.jsx/
// ConfirmModal.jsx, just with a form body instead of a list or a message.
//
// `sections` (only used in 'full' mode): [{ key, label, description? }].
// `onGenerate(({ userName, selectedKeys }) => Promise<void>)` — awaited;
// the modal shows an inline "Generating…" state and disables its own
// controls for the duration (a full report can take a genuinely visible
// few seconds, given it mounts and captures several diagrams in sequence).
export default function ReportOptionsModal({
  mode = 'reduced', title, accentColor = '#2563eb', sections = [], onGenerate, onClose,
}) {
  const [userName, setUserName] = useState('');
  const [checked, setChecked] = useState(() => Object.fromEntries(sections.map((s) => [s.key, true])));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const overlayClose = useOverlayClose(generating ? () => {} : onClose);

  const toggle = (key) => setChecked((c) => ({ ...c, [key]: !c[key] }));

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const selectedKeys = sections.filter((s) => checked[s.key]).map((s) => s.key);
      await onGenerate({ userName: userName.trim(), selectedKeys });
      onClose();
    } catch (err) {
      setError(err.message || 'Report generation failed.');
      setGenerating(false);
    }
  };

  const noSectionsSelected = mode === 'full' && sections.length > 0 && sections.every((s) => !checked[s.key]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      {...overlayClose}
    >
      <div
        style={{ background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 10, width: 420, maxHeight: '82vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)', color: TEXT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={generating} style={{ background: 'none', border: 'none', color: TEXT_DIM, fontSize: 20, cursor: generating ? 'default' : 'pointer', lineHeight: 1, opacity: generating ? 0.4 : 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: sections.length > 0 ? 18 : 4 }}>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 5, fontWeight: 600 }}>Your name</div>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={generating}
              placeholder="(optional)"
              style={{
                width: '100%', boxSizing: 'border-box', background: '#161b22', border: `1px solid ${BORDER}`,
                color: TEXT, borderRadius: 5, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 4 }}>
              Date: {new Date().toLocaleDateString()}
            </div>
          </div>

          {mode === 'full' && sections.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, fontWeight: 600 }}>Include</div>
              {sections.map((s) => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, cursor: generating ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!checked[s.key]}
                    onChange={() => toggle(s.key)}
                    disabled={generating}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, display: 'block' }}>{s.label}</span>
                    {s.description && <span style={{ fontSize: 11, color: TEXT_DIM, display: 'block', lineHeight: 1.4 }}>{s.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: '#f85149', marginTop: 10, lineHeight: 1.5 }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            disabled={generating}
            style={{ padding: '7px 16px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT_DIM, fontSize: 13, cursor: generating ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || noSectionsSelected}
            title={noSectionsSelected ? 'Select at least one section' : undefined}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none',
              background: (generating || noSectionsSelected) ? '#21262d' : accentColor,
              color: (generating || noSectionsSelected) ? TEXT_DIM : '#fff',
              fontSize: 13, fontWeight: 600, cursor: (generating || noSectionsSelected) ? 'default' : 'pointer',
            }}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
