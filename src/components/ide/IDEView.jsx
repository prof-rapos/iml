import { useState } from 'react';
import { useIdeStore } from '../../store/ideStore';
import Notification from '../Notification';
import IDETopbar from './IDETopbar';
import FileTree from './FileTree';
import CodeEditor from './CodeEditor';
import IDETerminal from './IDETerminal';
import NewFileDialog from './NewFileDialog';
import NewProjectWizard from './NewProjectWizard';

const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACTIVE_TAB = '#0d1117';
const TAB_BG = '#161b22';

function basename(path) {
  return path.split('/').pop();
}

export default function IDEView() {
  const {
    files, activeFilePath, openFilePaths, projectPackage,
    openFile, closeTab, setActiveFile, updateContent,
    addFile, deleteFile, renameFile, loadFiles, setProjectPackage,
  } = useIdeStore();

  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen]       = useState(false);
  const [deleteConfirmPath, setDeleteConfirmPath] = useState(null);

  const showEmptyState = files.length === 0 && !newProjectOpen;

  const handleImportZip = () => {
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
        if (!entry.dir && path.endsWith('.java'))
          loaded.push({ path, content: await entry.async('string') });
      }
      if (loaded.length > 0) loadFiles(loaded, loaded[0].path);
    };
    input.click();
  };

  const handleNewFile = ({ path, content }) => {
    setNewFileDialogOpen(false);
    addFile(path, content);
  };

  const handleDelete = (path) => setDeleteConfirmPath(path);

  const confirmDelete = () => {
    deleteFile(deleteConfirmPath);
    setDeleteConfirmPath(null);
  };

  const handleRename = (oldPath, newFilename) => {
    const dir = oldPath.split('/').slice(0, -1).join('/');
    const newPath = dir ? `${dir}/${newFilename}` : newFilename;
    renameFile(oldPath, newPath);
  };

  const handleWizardConfirm = ({ packageName, files: newFiles, activePath }) => {
    setNewProjectOpen(false);
    setProjectPackage(packageName);
    loadFiles(newFiles, activePath);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: TEXT, fontFamily: 'var(--iml-font-sans)' }}>
      <Notification />
      <IDETopbar />

      {showEmptyState ? (
        <EmptyState onNew={() => setNewProjectOpen(true)} onImportZip={handleImportZip} />
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* File tree */}
          <FileTree
            files={files}
            activeFilePath={activeFilePath}
            projectPackage={projectPackage}
            onSelect={openFile}
            onDelete={handleDelete}
            onRename={handleRename}
            onNewFile={() => setNewFileDialogOpen(true)}
          />

          {/* Editor + output */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tabs */}
            {openFilePaths.length > 0 && (
              <div style={{
                display: 'flex', flexShrink: 0, overflowX: 'auto',
                background: TAB_BG, borderBottom: `1px solid ${BORDER}`,
              }}>
                {openFilePaths.map((path) => {
                  const active = path === activeFilePath;
                  return (
                    <div
                      key={path}
                      onClick={() => setActiveFile(path)}
                      title={path}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '0 12px', height: 34, cursor: 'pointer',
                        background: active ? ACTIVE_TAB : TAB_BG,
                        borderRight: `1px solid ${BORDER}`,
                        borderBottom: active ? `2px solid #2563eb` : '2px solid transparent',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 12, color: active ? TEXT : TEXT_DIM, userSelect: 'none', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {basename(path)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); closeTab(path); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Monaco editor */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CodeEditor
                files={files}
                activeFilePath={activeFilePath}
                onContentChange={updateContent}
              />
            </div>

            {/* Terminal */}
            <IDETerminal files={files} />
          </div>
        </div>
      )}

      {/* New file dialog */}
      {newFileDialogOpen && (
        <NewFileDialog
          projectPackage={projectPackage}
          existingPaths={files.map((f) => f.path)}
          onConfirm={handleNewFile}
          onCancel={() => setNewFileDialogOpen(false)}
        />
      )}

      {/* New project wizard (triggered from empty state) */}
      {newProjectOpen && (
        <NewProjectWizard
          onConfirm={handleWizardConfirm}
          onCancel={() => setNewProjectOpen(false)}
        />
      )}

      {/* Themed delete confirm */}
      {deleteConfirmPath && (
        <DeleteConfirmDialog
          filename={basename(deleteConfirmPath)}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirmPath(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirmDialog({ filename, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }} onClick={onCancel}>
      <div style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '24px 28px 20px', width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: '#e6edf3', fontFamily: 'var(--iml-font-sans)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Delete file?</div>
        <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6, marginBottom: 20 }}>
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#e6edf3' }}>{filename}</code> will be permanently removed from the project.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8b949e', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew, onImportZip }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: TEXT_DIM }}>
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
        <rect x="6" y="4" width="36" height="40" rx="3"/>
        <path d="M14 16h20M14 24h20M14 32h12"/>
      </svg>
      <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, textAlign: 'center' }}>No project open</div>
      <div style={{ fontSize: 13, color: TEXT_DIM, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
        Start a new project, import an existing one, or generate code from the Structural Modeling module.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button
          onClick={onNew}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          New Project
        </button>
        <button
          onClick={onImportZip}
          style={{
            padding: '10px 24px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.07)', color: '#f1f5f9', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Import ZIP
        </button>
      </div>
    </div>
  );
}
