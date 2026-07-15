import { useRef, useState, useEffect } from 'react';
import { toJpeg } from 'html-to-image';
import { useModelStore } from '../../store/modelStore';
import { useBehaviourStore } from '../../store/behaviourStore';
import { useCapsuleStructureStore } from '../../store/capsuleStructureStore';

const TEXT     = '#e6edf3';
const TEXT_DIM = '#8b949e';
const BORDER   = 'rgba(255,255,255,0.10)';

export default function BehaviourTopbar() {
  const classes         = useModelStore((s) => s.metaModel.classes);
  const metaModel        = useModelStore((s) => s.metaModel);
  const setAppView       = useModelStore((s) => s.setAppView);
  const getFullJSON      = useModelStore((s) => s.getFullJSON);
  const loadFromJSON     = useModelStore((s) => s.loadFromJSON);
  const instanceModels   = useModelStore((s) => s.instanceModels);
  const currentIMIndex   = useModelStore((s) => s.currentIMIndex);
  const switchInstanceModel = useModelStore((s) => s.switchInstanceModel);
  const capsuleId     = useBehaviourStore((s) => s.capsuleId);
  const setCapsule    = useBehaviourStore((s) => s.setCapsule);
  const subView       = useBehaviourStore((s) => s.subView);
  const setSubView    = useBehaviourStore((s) => s.setSubView);
  const rebuildStructure = useCapsuleStructureStore((s) => s.rebuild);

  const currentIM = instanceModels[currentIMIndex];

  const handleSubViewChange = (v) => {
    setSubView(v);
    if (v === 'structure') rebuildStructure();
  };

  const handleInstanceModelChange = (idx) => {
    switchInstanceModel(idx);
    rebuildStructure();
  };

  // If the selected capsule's class was deleted elsewhere (e.g. Structural
  // Modeling), drop the stale reference instead of leaving a dead capsuleId
  // that no longer matches any <option> or resolves to a real class.
  useEffect(() => {
    if (capsuleId && !classes.some((c) => c.id === capsuleId)) setCapsule(null);
  }, [capsuleId, classes, setCapsule]);

  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleExportIml = () => {
    const blob = new Blob([JSON.stringify(getFullJSON(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}.iml.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const handleImportIml = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        loadFromJSON(JSON.parse(ev.target.result));
        setCapsule(null); // model changed — clear the (possibly stale) capsule
        rebuildStructure();
      } catch { alert('Invalid JSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportJpeg = async () => {
    setMenuOpen(false);
    const node = document.querySelector('.react-flow');
    if (!node) return;
    try {
      const dataUrl = await toJpeg(node, {
        quality: 0.95, backgroundColor: '#334155',
        filter: (el) => !el.classList?.contains('react-flow__controls'),
      });
      const cls = classes.find((c) => c.id === capsuleId);
      const label = subView === 'structure' ? (currentIM?.name || 'structure') : (cls?.name || 'statemachine');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${label}-behaviour.jpg`;
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  return (
    <div style={{
      height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 16px', background: '#161b22', borderBottom: `1px solid ${BORDER}`,
      fontFamily: 'var(--iml-font-sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: '#fff', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <img src={`${import.meta.env.BASE_URL}logos/logo.png`} alt="IML" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Behavioural Modeling</span>
      </div>

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      <div style={{ display: 'flex', background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 6, padding: 2 }}>
        {[['statemachine', 'State Machine'], ['structure', 'Structure']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => handleSubViewChange(v)}
            style={{
              padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: subView === v ? '#7c3aed' : 'transparent',
              color: subView === v ? '#fff' : TEXT_DIM,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: BORDER, margin: '0 4px' }} />

      {subView === 'statemachine' ? (
        <>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>Capsule</span>
          <select
            value={capsuleId ?? ''}
            onChange={(e) => setCapsule(e.target.value || null)}
            style={{ background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 5, padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 160 }}
          >
            <option value="">— select a class —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.isAbstract ? ' «abstract»' : ''}</option>
            ))}
          </select>
        </>
      ) : (
        <>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>Instance Model</span>
          <select
            value={currentIMIndex}
            onChange={(e) => handleInstanceModelChange(Number(e.target.value))}
            style={{ background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 5, padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 160 }}
          >
            {instanceModels.map((im, i) => (
              <option key={im.id} value={i}>{im.name}</option>
            ))}
          </select>
        </>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setAppView('home')}
        style={btn(false)}
        title="Back to home"
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
        </svg>
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button onClick={() => setMenuOpen((o) => !o)} title="Menu" style={{ ...btn(menuOpen), flexDirection: 'column', gap: 3 }}>
          <span style={bar} /><span style={bar} /><span style={bar} />
        </button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 170, overflow: 'hidden',
          }}>
            <div style={sectionStyle}>Model</div>
            <MenuItem onClick={() => { fileRef.current.click(); setMenuOpen(false); }}>Import IML</MenuItem>
            <MenuItem onClick={handleExportIml}>Export IML</MenuItem>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
            <MenuItem onClick={handleExportJpeg} disabled={subView === 'statemachine' ? !capsuleId : !currentIM}>Export JPG</MenuItem>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportIml} />
    </div>
  );
}

const btn = (active) => ({
  width: 34, height: 34, borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${BORDER}`, background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
  color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center',
});
const bar = { display: 'block', width: 15, height: 1.5, background: TEXT, borderRadius: 1 };
const sectionStyle = { padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' };

function MenuItem({ children, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, fontWeight: 500,
        background: hover && !disabled ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: disabled ? TEXT_DIM : TEXT, border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
