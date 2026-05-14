import { useState } from 'react';
import { useIdeStore } from '../../store/ideStore';
import IDETopbar from './IDETopbar';
import FileTree from './FileTree';
import CodeEditor from './CodeEditor';
import IDEOutputPanel from './IDEOutputPanel';
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
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Open new project wizard on first load if no files
  const showEmptyState = files.length === 0 && !newProjectOpen;

  const handleNewFile = ({ path, content }) => {
    setNewFileDialogOpen(false);
    addFile(path, content);
  };

  const handleDelete = (path) => {
    if (!window.confirm(`Delete ${basename(path)}?`)) return;
    deleteFile(path);
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
      <IDETopbar onNewProject={() => {}} />

      {showEmptyState ? (
        <EmptyState onNew={() => setNewProjectOpen(true)} />
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

            {/* Output panel */}
            <IDEOutputPanel files={files} />
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
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: TEXT_DIM }}>
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
        <rect x="6" y="4" width="36" height="40" rx="3"/>
        <path d="M14 16h20M14 24h20M14 32h12"/>
      </svg>
      <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, textAlign: 'center' }}>No project open</div>
      <div style={{ fontSize: 13, color: TEXT_DIM, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
        Start a new project, import files, or generate code from the Structural Modeling module.
      </div>
      <button
        onClick={onNew}
        style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        New Project
      </button>
    </div>
  );
}
