import { useState } from 'react';
import { useTransformStore } from '../../store/transformStore';
import { useModelStore } from '../../store/modelStore';
import { runTransform } from '../../utils/runTransform';
import { validateModelShape } from '../../utils/modelHelpers';
import { TEXT, TEXT_DIM } from '../theme';

const BORDER   = 'rgba(255,255,255,0.10)';
const ACCENT   = '#7c3aed';

function loadJsonFile(onLoad, onError) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Only checked "does metaModel exist" before — a wrong-shaped-but-
      // present metaModel (missing classes/relations arrays, an old schema)
      // passed straight through and crashed downstream instead, with no
      // error boundary anywhere in the app to catch it.
      const shapeError = validateModelShape(data);
      if (shapeError) throw new Error(shapeError);
      onLoad(data);
    } catch (err) {
      onError(err.message || 'Invalid file');
    }
  };
  input.click();
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function TransformTopbar() {
  const { source, target, rules, result, loadSource, loadTarget, setResult } = useTransformStore();
  const setAppView = useModelStore((s) => s.setAppView);
  const [error, setError] = useState(null);

  const canRun = !!(source && target && rules.length > 0);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  const handleRun = () => {
    if (!canRun) return;
    try {
      setResult(runTransform(source, target, rules));
    } catch (err) {
      showError(`Transform failed: ${err.message}`);
    }
  };

  return (
    <div style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 16px',
      background: '#161b22',
      borderBottom: `1px solid ${BORDER}`,
      fontFamily: 'var(--iml-font-sans)',
    }}>
      {/* Logo + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: '#fff', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={`${import.meta.env.BASE_URL}logos/logo.png`}
            alt="IML"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, letterSpacing: '-0.2px' }}>
          M2M Transformations
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      {/* Load buttons */}
      <button
        onClick={() => loadJsonFile(loadSource, showError)}
        style={btnStyle('#21262d')}
        title="Load source .iml.json (meta-model + instances)"
      >
        Load Source
        {source && <span style={{ color: '#3fb950', marginLeft: 4 }}>✓</span>}
      </button>

      <button
        onClick={() => loadJsonFile(loadTarget, showError)}
        style={btnStyle('#21262d')}
        title="Load target .iml.json (meta-model only)"
      >
        Load Target
        {target && <span style={{ color: '#3fb950', marginLeft: 4 }}>✓</span>}
      </button>

      <div style={{ flex: 1 }} />

      {/* Run */}
      <button
        onClick={handleRun}
        disabled={!canRun}
        style={btnStyle(canRun ? ACCENT : '#21262d', !canRun)}
        title={!canRun ? 'Load both models and add at least one rule' : 'Run transformation'}
      >
        ▶ Run Transform
      </button>

      {/* Download result */}
      <button
        onClick={() => result && downloadJson(result, 'transform-result.iml.json')}
        disabled={!result}
        style={btnStyle(result ? '#1f6feb' : '#21262d', !result)}
        title={result ? 'Download result as .iml.json' : 'Run the transform first'}
      >
        ↓ Download Result
      </button>

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      {/* Home */}
      <button
        onClick={() => setAppView('home')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
        title="Back to home"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
        </svg>
      </button>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2000, background: '#3d1212', border: '1px solid #f85149',
          borderRadius: 6, padding: '8px 16px', fontSize: 12, color: '#f85149',
          fontFamily: 'var(--iml-font-sans)', pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          ✕ {error}
        </div>
      )}
    </div>
  );
}

const btnStyle = (bg, disabled = false) => ({
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
  background: bg, color: disabled ? TEXT_DIM : TEXT,
  border: `1px solid ${BORDER}`, cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.55 : 1, fontFamily: 'inherit',
});
