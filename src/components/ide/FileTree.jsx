import { useState, useRef, useEffect } from 'react';

const TEXT = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACCENT = '#2563eb';
const BORDER = 'rgba(255,255,255,0.08)';
const HOVER_BG = 'rgba(255,255,255,0.06)';
const ACTIVE_BG = 'rgba(37,99,235,0.25)';

// Build a tree from flat file paths
function buildTree(files) {
  const root = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = f.path; // leaf = full path
  }
  return root;
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M4 1.5H3a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2v-9a2 2 0 00-2-2h-1v1h1a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1h1v-1z"/>
      <path d="M9.5 1v4h4l-4-4zM4 1h5.5l4 4V14H4V1z" fillOpacity=".9"/>
    </svg>
  );
}

function FolderIcon({ open }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill={open ? '#e3b341' : '#8b949e'} style={{ flexShrink: 0 }}>
      {open
        ? <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v1H1v-3zm0 4.5h14l-1.5 5.5H2.5L1 8z"/>
        : <path d="M.54 3.87L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.828.828A2 2 0 009.828 3H14a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4a.997.997 0 01.54-.13z"/>
      }
    </svg>
  );
}

function TreeNode({ name, node, depth, activeFilePath, onSelect, onDelete, onRename }) {
  const isFile = typeof node === 'string';
  const [open, setOpen] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const renameRef = useRef(null);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  const startRename = () => {
    setRenameVal(name.replace(/\.java$/, ''));
    setRenaming(true);
  };

  const commitRename = () => {
    const newName = renameVal.trim();
    if (newName && newName !== name.replace(/\.java$/, '')) {
      onRename(node, newName + '.java');
    }
    setRenaming(false);
  };

  const isActive = isFile && node === activeFilePath;
  const indent = depth * 14 + 8;

  if (isFile) {
    return (
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => onSelect(node)}
        onDoubleClick={startRename}
        title={node}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `3px 8px 3px ${indent}px`,
          background: isActive ? ACTIVE_BG : hovering ? HOVER_BG : 'transparent',
          borderRadius: 4, cursor: 'pointer', userSelect: 'none',
        }}
      >
        <FileIcon />
        {renaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0d1117', border: '1px solid #2563eb', borderRadius: 3,
              color: TEXT, fontSize: 12, padding: '1px 4px', outline: 'none',
              width: '100%', fontFamily: 'ui-monospace, Consolas, monospace',
            }}
          />
        ) : (
          <span style={{ fontSize: 12, color: isActive ? TEXT : TEXT_DIM, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
        )}
        {hovering && !renaming && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            title="Delete file"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f85149', padding: '0 2px', fontSize: 14, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        )}
      </div>
    );
  }

  // Folder
  const children = Object.entries(node).sort(([, a], [, b]) => {
    const aIsFile = typeof a === 'string';
    const bIsFile = typeof b === 'string';
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return 0;
  });

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `3px 8px 3px ${indent}px`,
          cursor: 'pointer', userSelect: 'none',
          color: TEXT_DIM, fontSize: 12,
        }}
      >
        <span style={{ width: 8, display: 'inline-block', textAlign: 'center', fontSize: 9, color: TEXT_DIM }}>
          {open ? '▾' : '▸'}
        </span>
        <FolderIcon open={open} />
        <span>{name}</span>
      </div>
      {open && children.map(([childName, childNode]) => (
        <TreeNode
          key={childName}
          name={childName}
          node={childNode}
          depth={depth + 1}
          activeFilePath={activeFilePath}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

export default function FileTree({ files, activeFilePath, onSelect, onDelete, onRename, onNewFile, projectPackage }) {
  const tree = buildTree(files);
  const entries = Object.entries(tree).sort(([, a], [, b]) => {
    const aIsFile = typeof a === 'string';
    const bIsFile = typeof b === 'string';
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return 0;
  });

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      background: '#0d1117',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 6px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: TEXT_DIM,
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        Project
      </div>

      {/* Tree */}
      <div style={{ flex: 1, padding: '4px 0', overflowY: 'auto' }}>
        {files.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 12, color: TEXT_DIM }}>No files yet.</div>
        ) : (
          entries.map(([name, node]) => (
            <TreeNode
              key={name}
              name={name}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))
        )}
      </div>

      {/* New File button */}
      {projectPackage && (
        <button
          onClick={onNewFile}
          style={{
            margin: 8, padding: '6px', borderRadius: 5, cursor: 'pointer',
            border: `1px dashed ${BORDER}`, background: 'transparent',
            color: TEXT_DIM, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New File
        </button>
      )}
    </div>
  );
}
