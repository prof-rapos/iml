import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { toJpeg } from 'html-to-image';
import { useModelStore } from '../../store/modelStore';
import { useIdeStore } from '../../store/ideStore';
import { useMbtStore } from '../../store/mbtStore';
import { generateAllTestsFiles } from '../../utils/mbtCodeGen';
import { useOutsideClick } from '../../utils/useOutsideClick';
import { MenuSection, MenuDivider, MenuItem, HomeButton } from '../topbarMenu';
import ModuleSwitcher from '../ModuleSwitcher';
import { TEXT } from '../theme';

const BORDER = 'rgba(255,255,255,0.10)';

export default function MBTTopbar() {
  const setAppView = useModelStore((s) => s.setAppView);
  const metaModel  = useModelStore((s) => s.metaModel);
  const notify     = useModelStore((s) => s.notify);
  const capsuleId  = useMbtStore((s) => s.capsuleId);
  const setResult  = useMbtStore((s) => s.setResult);
  const { loadFiles: ideLoadFiles } = useIdeStore();

  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen);

  // Shared by both menu actions — 100% path coverage as one bundle (every
  // non-open, non-depth-bound leaf), same generator "Run Test" uses per-leaf.
  const getAllTestsFiles = () => {
    if (!capsuleId || !setResult) {
      notify('Select a capsule and build its symbolic execution tree first.');
      return null;
    }
    const cls = metaModel.classes.find((c) => c.id === capsuleId);
    if (!cls) return null;
    return generateAllTestsFiles(setResult, cls, metaModel);
  };

  const handleGenerateAllTests = () => {
    setMenuOpen(false);
    const generated = getAllTestsFiles();
    if (!generated) return;
    ideLoadFiles(generated.files, generated.mainClassPath);
    setAppView('ide');
  };

  const handleExportZip = async () => {
    setMenuOpen(false);
    const generated = getAllTestsFiles();
    if (!generated) return;
    const zip = new JSZip();
    for (const { path, content } of generated.files) zip.file(path, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}-tests.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Same pattern as Structural/Behavioural's Export JPG (Topbar.jsx,
  // BehaviourTopbar.jsx) — captures whatever's currently visible in the
  // canvas, not an auto-fit-everything shot, same caveat those already have
  // for a diagram bigger than the viewport.
  const handleExportJpeg = async () => {
    setMenuOpen(false);
    const node = document.querySelector('.react-flow');
    if (!node) return;
    try {
      const dataUrl = await toJpeg(node, {
        quality: 0.95, backgroundColor: '#1a1f2b',
        filter: (el) => !el.classList?.contains('react-flow__controls'),
      });
      const cls = metaModel.classes.find((c) => c.id === capsuleId);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${cls?.name || 'set'}-symbolic-execution-tree.jpg`;
      a.click();
    } catch (err) {
      notify(`Export failed: ${err.message}`);
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
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Model-Based Testing</span>
      </div>

      <div style={{ flex: 1 }} />

      <ModuleSwitcher current="testing" size={34} borderColor={BORDER} color={TEXT} />

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
            borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 180, overflow: 'hidden',
          }}>
            <MenuSection label="Generate" />
            <MenuItem onClick={handleGenerateAllTests}>Generate All Tests</MenuItem>
            <MenuItem onClick={handleExportZip}>Export as ZIP</MenuItem>
            <MenuDivider />
            <MenuItem onClick={handleExportJpeg} disabled={!capsuleId} title={!capsuleId ? 'Select a capsule and build its tree first' : undefined}>Export JPG</MenuItem>
          </div>
        )}
      </div>
    </div>
  );
}
