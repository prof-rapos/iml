import { useModelStore } from '../store/modelStore';
import { useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import { useOutsideClick } from '../utils/useOutsideClick';
import { useGenerateMenu } from './useGenerateMenu';
import { MenuSection, MenuDivider, MenuItem, HomeButton } from './topbarMenu';
import ModuleSwitcher from './ModuleSwitcher';

export default function Topbar() {
  const mode = useModelStore((s) => s.mode);
  const metaModel = useModelStore((s) => s.metaModel);
  const instanceModel = useModelStore((s) => s.instanceModels[s.currentIMIndex]);
  const getFullJSON = useModelStore((s) => s.getFullJSON);
  const loadFromJSON = useModelStore((s) => s.loadFromJSON);
  const setAppView = useModelStore((s) => s.setAppView);

  const fileRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const { menuSection: generateMenuSection, dialog: generateDialog } =
    useGenerateMenu({ defaultScope: 'structural', closeMenu: () => setMenuOpen(false) });

  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

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
    <>
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
          <img src={`${import.meta.env.BASE_URL}logos/logo.png`} alt="IML" style={{ width: 50, height: 50, objectFit: 'contain' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Instructional Modeling Language</span>
      </div>

      <div style={{ flex: 1 }} />

      <ModuleSwitcher current="structural" />

      {/* Home button */}
      <HomeButton onClick={() => setAppView('home')} />

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
            {generateMenuSection}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoad} />
    </div>

    {generateDialog}
    </>
  );
}
