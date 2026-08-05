import { useState } from 'react';
import JSZip from 'jszip';
import { useModelStore } from '../store/modelStore';
import { useIdeStore } from '../store/ideStore';
import { generateJavaCode, toClassName, toPackageName } from '../utils/javaCodeGen';
import OverwriteConfirmDialog from './ide/OverwriteConfirmDialog';
import { MenuSection, MenuItem } from './topbarMenu';

const SCOPE_OPTIONS = [
  { value: 'structural',  label: 'Structural' },
  { value: 'behavioural', label: 'Behavioural' },
  { value: 'all',         label: 'All' },
];

// Shared "Generate" menu section (scope picker + Open in IDE / Export as ZIP)
// used by both Topbar (Structural Modeling) and BehaviourTopbar (Behavioural
// Modeling) — codegen isn't tied to either editor, so both need a way to
// trigger it without switching views. Returns JSX to splice into the caller's
// own dropdown, plus the overwrite-confirm dialog to render alongside it.
export function useGenerateMenu({ defaultScope = 'structural', closeMenu } = {}) {
  const metaModel          = useModelStore((s) => s.metaModel);
  const instanceModels     = useModelStore((s) => s.instanceModels);
  const currentIMIndex     = useModelStore((s) => s.currentIMIndex);
  const setAppView         = useModelStore((s) => s.setAppView);
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  const notify              = useModelStore((s) => s.notify);
  const { files: ideFiles, loadFiles: ideLoadFiles } = useIdeStore();

  const [scope, setScope] = useState(defaultScope);
  const [overwriteDialog, setOverwriteDialog] = useState(null); // null | { generatedFiles, activePath }

  // Blocking only inside the click handler (as before) meant the menu items
  // looked identically clickable whether or not Generate would actually do
  // anything — and in the Behavioural/MBT views specifically, the resulting
  // notify() had nowhere to render at all (no <Notification/> was mounted
  // there), so a blocked Generate looked exactly like a silent no-op.
  const blocked = conformanceResults.length > 0;
  const blockedTitle = blocked
    ? `${conformanceResults.length} conformance issue${conformanceResults.length > 1 ? 's' : ''} must be resolved first — see the Conformance badge.`
    : undefined;

  const getGeneratedFiles = () => {
    if (conformanceResults.length > 0) {
      notify(`Cannot generate code: ${conformanceResults.length} conformance issue${conformanceResults.length > 1 ? 's' : ''} must be resolved first.`);
      return null;
    }
    return generateJavaCode(metaModel, instanceModels, scope);
  };

  const handleExportZip = async () => {
    closeMenu?.();
    const files = getGeneratedFiles();
    if (!files) return;
    const zip = new JSZip();
    for (const { path, content } of files) zip.file(path, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metaModel.name || 'model'}-java.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenInIDE = () => {
    closeMenu?.();
    const files = getGeneratedFiles();
    if (!files) return;

    // Determine active file: the currently selected instance model's file
    const im     = instanceModels[currentIMIndex];
    const pkgDir = `iml/${toPackageName(metaModel.name)}`;
    const activePath = im ? `${pkgDir}/${toClassName(im.name)}.java` : files[0]?.path;

    if (ideFiles.length > 0) {
      setOverwriteDialog({ generatedFiles: files, activePath });
    } else {
      ideLoadFiles(files, activePath);
      setAppView('ide');
    }
  };

  const doLoadAndOpenIDE = async (doExport, generatedFiles, activePath) => {
    if (doExport) {
      const zip = new JSZip();
      for (const f of ideFiles) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'iml-project.zip'; a.click();
      URL.revokeObjectURL(url);
    }
    ideLoadFiles(generatedFiles, activePath);
    setOverwriteDialog(null);
    setAppView('ide');
  };

  const menuSection = (
    <>
      <MenuSection label="Generate" />
      <div style={{ display: 'flex', gap: 4, padding: '2px 14px 8px' }}>
        {SCOPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setScope(opt.value)}
            title={`Generate ${opt.label.toLowerCase()} code`}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600, borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
              background: scope === opt.value ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: scope === opt.value ? '#f1f5f9' : 'rgba(255,255,255,0.6)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <MenuItem onClick={handleOpenInIDE} disabled={blocked} title={blockedTitle}>Open in IDE</MenuItem>
      <MenuItem onClick={handleExportZip} disabled={blocked} title={blockedTitle}>Export as ZIP</MenuItem>
      {blocked && (
        <div style={{ padding: '2px 14px 8px', fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>
          ⚠ {conformanceResults.length} conformance issue{conformanceResults.length > 1 ? 's' : ''} must be resolved first.
        </div>
      )}
    </>
  );

  const dialog = overwriteDialog && (
    <OverwriteConfirmDialog
      onExportAndProceed={() => doLoadAndOpenIDE(true, overwriteDialog.generatedFiles, overwriteDialog.activePath)}
      onProceed={() => doLoadAndOpenIDE(false, overwriteDialog.generatedFiles, overwriteDialog.activePath)}
      onCancel={() => setOverwriteDialog(null)}
    />
  );

  return { menuSection, dialog };
}
