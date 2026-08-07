import { useRef, useState } from 'react';
import { useTransformStore } from '../../store/transformStore';
import { useModelStore, getAllAttributes } from '../../store/modelStore';
import { runTransform } from '../../utils/runTransform';
import { validateModelShape } from '../../utils/modelHelpers';
import { buildTransformSummaryPdf } from '../../utils/generateTransformReport';
import { useOutsideClick } from '../../utils/useOutsideClick';
import { TEXT, TEXT_DIM } from '../theme';
import ModuleSwitcher from '../ModuleSwitcher';
import { HomeButton, MenuSection, MenuItem } from '../topbarMenu';
import ReportOptionsModal from '../ReportOptionsModal';

const BORDER   = 'rgba(255,255,255,0.10)';
const ACCENT   = '#7c3aed';

function loadJsonFile(onLoad, onError, requireInstances = false) {
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
      const shapeError = validateModelShape(data, requireInstances);
      if (shapeError) throw new Error(shapeError);
      onLoad(data);
    } catch (err) {
      onError(err.message || 'Invalid file');
    }
  };
  input.click();
}

// A target attribute with lowerBound > 0 is required by its own meta-model
// (see conformance.js's identical check for the modeling/IDE side, which
// this mirrors) — mapping it as "omit" produces an object that fails that
// requirement with no value at all. Nothing in the transform pipeline ever
// checked lowerBound before, so this silently shipped non-conforming
// output; computed here (not just after Running) so Run itself can be
// blocked rather than merely warning after the fact.
function omitRequiredViolations(rules, target) {
  if (!target) return [];
  const violations = [];
  for (const rule of rules) {
    const tgtAttrs = getAllAttributes(rule.targetClassId, target.metaModel);
    for (const m of rule.attributeMappings) {
      if (m.type !== 'omit') continue;
      const attr = tgtAttrs.find((a) => a.id === m.targetAttrId);
      if (attr && attr.lowerBound > 0) violations.push({ rule, attr });
    }
  }
  return violations;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const menuRef = useRef(null);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

  const violations = omitRequiredViolations(rules, target);
  const canRun = !!(source && target && rules.length > 0) && violations.length === 0;
  const runBlockedReason = !source || !target || rules.length === 0
    ? 'Load both models and add at least one rule'
    : violations.length > 0
      ? `${violations.length} required attribute${violations.length !== 1 ? 's are' : ' is'} mapped to Omit — fix in the rule editor before running`
      : undefined;

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  const handleRun = () => {
    if (!canRun) return;
    try {
      const transformed = runTransform(source, target, rules);
      setResult(transformed);
      // Individual expression failures (div by zero, a multi-valued ref, a
      // typo) already degrade to "" per-value so the run itself still
      // succeeds — but that used to be silent apart from a console.warn.
      // Surface a count so it doesn't look like a clean, verified run.
      if (transformed.warnings?.length) {
        showError(`Transform completed with ${transformed.warnings.length} expression warning${transformed.warnings.length !== 1 ? 's' : ''} — see console for details.`);
      }
    } catch (err) {
      showError(`Transform failed: ${err.message}`);
    }
  };

  const handleGenerateSummaryReport = async ({ userName }) => {
    const doc = buildTransformSummaryPdf({ source, target, rules, result, userName });
    const safeName = (source?.metaModel?.name || 'transform').replace(/[^a-z0-9_-]+/gi, '_');
    doc.save(`${safeName}-summary.pdf`);
  };

  return (
    <div style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 10,
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
        onClick={() => loadJsonFile(loadSource, showError, true)}
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

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      {/* Run */}
      <button
        onClick={handleRun}
        disabled={!canRun}
        style={btnStyle(canRun ? ACCENT : '#21262d', !canRun)}
        title={runBlockedReason ?? 'Run transformation'}
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

      <div style={{ flex: 1 }} />

      {/* Right cluster — Modules + Home + Menu, same as every other topbar.
          Run Transform / Download Result stay as the primary inline
          buttons on the left; the menu versions are purely so this topbar
          has the same three right-side controls as the other four, which
          all have actions living exclusively in their own Menu (Import/
          Export IML etc.) — this one just doesn't need a File section. */}
      <ModuleSwitcher current="transformations" size={34} borderColor={BORDER} color={TEXT} />

      <HomeButton onClick={() => setAppView('home')} size={34} borderColor={BORDER} color={TEXT} />

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="Menu"
          style={{
            width: 34, height: 34, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${BORDER}`,
            background: menuOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
            color: TEXT,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span style={{ display: 'block', width: 16, height: 1.5, background: TEXT, borderRadius: 1 }} />
          <span style={{ display: 'block', width: 16, height: 1.5, background: TEXT, borderRadius: 1 }} />
          <span style={{ display: 'block', width: 16, height: 1.5, background: TEXT, borderRadius: 1 }} />
        </button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 170, overflow: 'hidden',
          }}>
            <MenuSection label="Transform" />
            <MenuItem
              onClick={() => { setMenuOpen(false); handleRun(); }}
              disabled={!canRun}
              title={runBlockedReason}
            >
              ▶ Run Transform
            </MenuItem>
            <MenuItem
              onClick={() => { setMenuOpen(false); result && downloadJson(result, 'transform-result.iml.json'); }}
              disabled={!result}
              title={!result ? 'Run the transform first' : undefined}
            >
              ↓ Download Result
            </MenuItem>
            <MenuItem
              onClick={() => { setMenuOpen(false); setReportModalOpen(true); }}
              disabled={!result}
              title={!result ? 'Run the transform first' : undefined}
            >
              ▤ Export Summary Report…
            </MenuItem>
          </div>
        )}
      </div>

      {reportModalOpen && (
        <ReportOptionsModal
          mode="reduced"
          title="Export Transformation Summary"
          accentColor={ACCENT}
          onGenerate={handleGenerateSummaryReport}
          onClose={() => setReportModalOpen(false)}
        />
      )}

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
