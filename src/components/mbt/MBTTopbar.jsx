import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { exportFlowImage } from '../../utils/exportDiagramImage';
import { useModelStore } from '../../store/modelStore';
import { useIdeStore } from '../../store/ideStore';
import { useMbtStore } from '../../store/mbtStore';
import { generateAllTestsFiles } from '../../utils/mbtCodeGen';
import { useOutsideClick } from '../../utils/useOutsideClick';
import { MenuSection, MenuDivider, MenuItem, HomeButton } from '../topbarMenu';
import ModuleSwitcher from '../ModuleSwitcher';
import LoadExampleModal from '../LoadExampleModal';
import ReportOptionsModal from '../ReportOptionsModal';
import { generateFullReport } from '../../utils/generateFullReport';
import { REPORT_SECTIONS } from '../reportSections';
import { TEXT } from '../theme';

const BORDER = 'rgba(255,255,255,0.10)';
// Matches TestCaseExplorerPanel.jsx's 'final' status color — this module's
// identity color (also the home page's Model-Based Testing icon color).
const REPORT_ACCENT = '#dc2626';

export default function MBTTopbar() {
  const setAppView   = useModelStore((s) => s.setAppView);
  const metaModel     = useModelStore((s) => s.metaModel);
  const instanceModels = useModelStore((s) => s.instanceModels);
  const getFullJSON  = useModelStore((s) => s.getFullJSON);
  const loadFromJSON = useModelStore((s) => s.loadFromJSON);
  const notify     = useModelStore((s) => s.notify);
  const capsuleId  = useMbtStore((s) => s.capsuleId);
  const setResult  = useMbtStore((s) => s.setResult);
  const selectLeaf = useMbtStore((s) => s.selectLeaf);
  const deselectAllNodes = useMbtStore((s) => s.deselectAll);
  const { loadFiles: ideLoadFiles } = useIdeStore();

  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exampleModalOpen, setExampleModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
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

  const handleExportIml = () => {
    setMenuOpen(false);
    const blob = new Blob([JSON.stringify(getFullJSON(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}.iml.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportIml = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        loadFromJSON(JSON.parse(ev.target.result));
        // mbtStore's own subscription already clears a stale capsuleId
        // whenever metaModel changes — no manual reset needed here.
      } catch { notify('Invalid JSON file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleGenerateReport = async ({ userName, selectedKeys }) => {
    await generateFullReport({ metaModel, instanceModels, userName, selectedKeys });
  };

  // Same pattern as Structural/Behavioural's export (Topbar.jsx,
  // BehaviourTopbar.jsx) — captures the WHOLE tree regardless of current
  // pan/zoom (see exportFlowImage's own comment for how).
  const handleExportImage = async (format) => {
    setMenuOpen(false);
    const cls = metaModel.classes.find((c) => c.id === capsuleId);
    const name = cls?.name || 'set';
    try {
      await exportFlowImage({
        format, filename: `${name}-symbolic-execution-tree.${format === 'svg' ? 'svg' : 'jpg'}`,
        beforeCapture: () => { selectLeaf(null); deselectAllNodes(); },
      });
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
            <MenuSection label="Model" />
            <MenuItem onClick={() => { fileRef.current.click(); setMenuOpen(false); }}>Import IML</MenuItem>
            <MenuItem onClick={handleExportIml}>Export IML</MenuItem>
            <MenuItem onClick={() => { setExampleModalOpen(true); setMenuOpen(false); }}>Load Example Model…</MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => handleExportImage('jpeg')} disabled={!capsuleId} title={!capsuleId ? 'Select a capsule and build its tree first' : undefined}>Export JPG</MenuItem>
            <MenuItem onClick={() => handleExportImage('svg')} disabled={!capsuleId} title={!capsuleId ? 'Select a capsule and build its tree first' : undefined}>Export SVG (vector)</MenuItem>
            <MenuItem onClick={() => { setReportModalOpen(true); setMenuOpen(false); }}>Generate Report…</MenuItem>
            <MenuDivider />
            <MenuSection label="Generate" />
            <MenuItem onClick={handleGenerateAllTests}>Generate All Tests</MenuItem>
            <MenuItem onClick={handleExportZip}>Export as ZIP</MenuItem>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportIml} />
      {exampleModalOpen && <LoadExampleModal onClose={() => setExampleModalOpen(false)} />}
      {reportModalOpen && (
        <ReportOptionsModal
          mode="full"
          title="Generate Report"
          accentColor={REPORT_ACCENT}
          sections={REPORT_SECTIONS}
          onGenerate={handleGenerateReport}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}
