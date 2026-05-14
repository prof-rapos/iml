import { useModelStore } from '../store/modelStore';
import { useRef, useState, useEffect } from 'react';
import { toJpeg } from 'html-to-image';
import JSZip from 'jszip';
import { generateJavaCode } from '../utils/javaCodeGen';

export default function Topbar() {
  const mode = useModelStore((s) => s.mode);
  const metaModel = useModelStore((s) => s.metaModel);
  const instanceModel = useModelStore((s) => s.instanceModels[s.currentIMIndex]);
  const getFullJSON = useModelStore((s) => s.getFullJSON);
  const loadFromJSON = useModelStore((s) => s.loadFromJSON);
  const instanceModels = useModelStore((s) => s.instanceModels);
  const setAppView = useModelStore((s) => s.setAppView);
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  const notify = useModelStore((s) => s.notify);

  const fileRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSave = () => {
    const data = getFullJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}.iml.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const handleLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        loadFromJSON(data);
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGenerateJava = async () => {
    setMenuOpen(false);
    if (conformanceResults.length > 0) {
      notify(`Cannot generate code: ${conformanceResults.length} conformance issue${conformanceResults.length > 1 ? 's' : ''} must be resolved first.`);
      return;
    }
    const files = generateJavaCode(metaModel, instanceModels);
    const zip = new JSZip();
    for (const { path, content } of files) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}-java.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJpeg = async () => {
    setMenuOpen(false);
    const node = document.querySelector('.react-flow');
    if (!node) return;
    try {
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        backgroundColor: '#ffffff',
        filter: (el) => {
          if (el.classList?.contains('react-flow__controls')) return false;
          if (el.classList?.contains('react-flow__minimap')) return false;
          return true;
        },
      });
      const exportName = mode === 'instance' ? (instanceModel?.name || 'instance') : (metaModel.name || 'model');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${exportName}.jpg`;
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  return (
    <div style={{
      height: 52,
      background: '#0f172a',
      color: '#f1f5f9',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    }}>
      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 60, height: 36,
          background: '#ffffff',
          borderRadius: 7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          <img src="/logos/logo.png" alt="IML" style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Instructional Modeling Language</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Home button */}
      <button
        onClick={() => setAppView('home')}
        title="Home"
        style={{
          width: 36, height: 36, borderRadius: 6, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.07)',
          color: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
        </svg>
      </button>

      {/* Hamburger menu — right side */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title="Menu"
          style={{
            width: 36, height: 36, borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.15)',
            background: menuOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
            color: '#f1f5f9',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span style={{ display: 'block', width: 16, height: 1.5, background: '#f1f5f9', borderRadius: 1 }} />
          <span style={{ display: 'block', width: 16, height: 1.5, background: '#f1f5f9', borderRadius: 1 }} />
          <span style={{ display: 'block', width: 16, height: 1.5, background: '#f1f5f9', borderRadius: 1 }} />
        </button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 170, overflow: 'hidden',
          }}>
            <MenuSection label="File" />
            <MenuItem onClick={() => { fileRef.current.click(); setMenuOpen(false); }}>Import IML</MenuItem>
            <MenuItem onClick={handleSave}>Export IML</MenuItem>
            <MenuDivider />
            <MenuItem onClick={handleExportJpeg}>Export JPG</MenuItem>
            <MenuDivider />
            <MenuSection label="Generate" />
            <MenuItem onClick={handleGenerateJava}>Generate Java Code</MenuItem>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoad} />
    </div>
  );
}

function MenuSection({ label }) {
  return (
    <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
      {label}
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />;
}

function MenuItem({ children, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '9px 14px', fontSize: 13, fontWeight: 500,
        background: hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: '#f1f5f9', border: 'none', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
