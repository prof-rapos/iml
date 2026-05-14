import { useState } from 'react';
import { useModelStore } from '../../store/modelStore';
import { useIdeStore } from '../../store/ideStore';
import JSZip from 'jszip';
import NewProjectWizard from './NewProjectWizard';

const TEXT = '#f1f5f9';
const TEXT_DIM = '#94a3b8';
const BORDER = 'rgba(255,255,255,0.15)';
const BTN = 'rgba(255,255,255,0.07)';
const BTN_HOVER = 'rgba(255,255,255,0.14)';
const ACCENT = '#2563eb';

async function exportZip(files, name = 'project') {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function TopBtn({ children, onClick, title, active, accent, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: 32, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active || accent ? ACCENT : BORDER}`,
        background: accent ? ACCENT : active ? 'rgba(37,99,235,0.2)' : hover && !disabled ? BTN_HOVER : BTN,
        color: disabled ? TEXT_DIM : TEXT, fontSize: 13, fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</button>
  );
}

export default function IDETopbar({ onNewProject }) {
  const setAppView     = useModelStore((s) => s.setAppView);
  const { files, clearProject, loadFiles, setProjectPackage } = useIdeStore();

  const [importMenuOpen, setImportMenuOpen]   = useState(false);
  const [confirmNew, setConfirmNew]           = useState(false);
  const [newProjectWizard, setNewProjectWizard] = useState(false);

  const hasFiles = files.length > 0;

  const handleExportZip = async () => {
    if (!hasFiles) return;
    await exportZip(files, 'iml-project');
  };

  const handleImportZip = () => {
    setImportMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const loaded = [];
      for (const [path, entry] of Object.entries(zip.files)) {
        if (!entry.dir && path.endsWith('.java')) {
          loaded.push({ path, content: await entry.async('string') });
        }
      }
      if (loaded.length > 0) loadFiles(loaded, loaded[0].path);
    };
    input.click();
  };

  const handleImportJava = () => {
    setImportMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.java';
    input.multiple = true;
    input.onchange = async (e) => {
      const fileList = Array.from(e.target.files);
      const loaded = await Promise.all(fileList.map(async (f) => ({
        path: f.name,
        content: await f.text(),
      })));
      if (loaded.length > 0) loadFiles(loaded, loaded[0].path);
    };
    input.click();
  };

  const handleNewProject = () => {
    if (hasFiles) {
      setConfirmNew(true);
    } else {
      setNewProjectWizard(true);
    }
  };

  const confirmAndNew = async (doExport) => {
    if (doExport) await exportZip(files, 'iml-project');
    clearProject();
    setConfirmNew(false);
    setNewProjectWizard(true);
  };

  const handleWizardConfirm = ({ packageName, files: newFiles, activePath }) => {
    setNewProjectWizard(false);
    setProjectPackage(packageName);
    loadFiles(newFiles, activePath);
    if (onNewProject) onNewProject();
  };

  return (
    <>
      <div style={{
        height: 52, background: '#0f172a', color: TEXT,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 4 }}>
          <div style={{ width: 60, height: 36, background: '#fff', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            <img src={`${import.meta.env.BASE_URL}logos/logo.png`} alt="IML" style={{ width: 50, height: 50, objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>IML IDE</span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

        {/* Back */}
        <TopBtn onClick={() => setAppView('structural')} title="Back to Structural Modeling">
          ← Structural
        </TopBtn>

        {/* New Project */}
        <TopBtn onClick={handleNewProject} title="Start a new project">
          New Project
        </TopBtn>

        {/* Import dropdown */}
        <div style={{ position: 'relative' }}>
          <TopBtn onClick={() => setImportMenuOpen((o) => !o)} title="Import files">
            Import ▾
          </TopBtn>
          {importMenuOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                minWidth: 160, overflow: 'hidden',
              }}
              onMouseLeave={() => setImportMenuOpen(false)}
            >
              <DropItem onClick={handleImportZip}>From ZIP</DropItem>
              <DropItem onClick={handleImportJava}>Java file(s)</DropItem>
            </div>
          )}
        </div>

        {/* Export ZIP */}
        <TopBtn onClick={handleExportZip} disabled={!hasFiles} title="Export project as ZIP">
          Export ZIP
        </TopBtn>

        <div style={{ flex: 1 }} />

        {/* Home */}
        <TopBtn onClick={() => setAppView('home')} title="Home">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
          </svg>
        </TopBtn>
      </div>

      {/* Confirm new project */}
      {confirmNew && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setConfirmNew(false)}
        >
          <div
            style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '28px 28px 22px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: TEXT, fontFamily: 'var(--iml-font-sans)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Start a new project?</div>
            <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.6, marginBottom: 24 }}>The current project will be cleared. Save your work first?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => confirmAndNew(true)} style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                Export current project as ZIP, then start new
              </button>
              <button onClick={() => confirmAndNew(false)} style={{ padding: '9px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                Start new without saving
              </button>
              <button onClick={() => setConfirmNew(false)} style={{ padding: '9px 16px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New project wizard */}
      {newProjectWizard && (
        <NewProjectWizard onConfirm={handleWizardConfirm} onCancel={() => setNewProjectWizard(false)} />
      )}
    </>
  );
}

function DropItem({ children, onClick }) {
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
    >{children}</button>
  );
}
