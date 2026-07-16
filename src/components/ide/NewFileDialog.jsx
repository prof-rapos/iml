import { useState } from 'react';
import { packageToDir } from '../../store/ideStore';
import { TEXT, TEXT_DIM } from '../theme';

const BG = '#161b22';
const BORDER = 'rgba(255,255,255,0.12)';
const ACCENT = '#2563eb';
const INPUT_BG = '#0d1117';

const KINDS = ['Class', 'Abstract Class', 'Interface', 'Enum'];

function buildContent(pkg, name, kind, withMain) {
  const pkgLine = pkg ? `package ${pkg};\n\n` : '';
  if (kind === 'Enum') return `${pkgLine}public enum ${name} {\n    ;\n}\n`;
  const decl =
    kind === 'Abstract Class' ? `public abstract class ${name}` :
    kind === 'Interface'      ? `public interface ${name}` :
    `public class ${name}`;
  const mainBlock = withMain && kind === 'Class'
    ? `\n    public static void main(String[] args) {\n        \n    }\n`
    : '\n    \n';
  return `${pkgLine}${decl} {${mainBlock}}\n`;
}

export default function NewFileDialog({ projectPackage, existingPaths, onConfirm, onCancel }) {
  const [name, setName]       = useState('');
  const [kind, setKind]       = useState('Class');
  const [withMain, setWithMain] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const filePath = (n) => projectPackage
    ? `${packageToDir(projectPackage)}/${n}.java`
    : `${n}.java`;

  const nameErr = submitted
    ? !name.trim() ? 'Class name is required'
      : !/^[A-Z][a-zA-Z0-9_]*$/.test(name.trim()) ? 'Must start with an uppercase letter'
      : existingPaths.includes(filePath(name.trim())) ? 'A file with this name already exists'
      : null
    : null;

  const handleSubmit = () => {
    setSubmitted(true);
    const trimmed = name.trim();
    if (!trimmed || !/^[A-Z][a-zA-Z0-9_]*$/.test(trimmed)) return;
    const path = filePath(trimmed);
    if (existingPaths.includes(path)) return;
    const content = buildContent(projectPackage, trimmed, kind, withMain);
    onConfirm({ path, content });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '28px 28px 22px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: TEXT, fontFamily: 'var(--iml-font-sans)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>New File</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 20 }}>
          Package: <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#79c0ff' }}>{projectPackage || '(none)'}</code>
        </div>

        {/* Kind */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT_DIM, marginBottom: 5 }}>Kind</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k} onClick={() => setKind(k)} style={{
                padding: '5px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                background: kind === k ? ACCENT : INPUT_BG,
                border: `1px solid ${kind === k ? ACCENT : BORDER}`,
                color: kind === k ? '#fff' : TEXT_DIM, fontWeight: kind === k ? 600 : 400,
              }}>{k}</button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT_DIM, marginBottom: 5 }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="MyClass"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: INPUT_BG, border: `1px solid ${nameErr ? '#f85149' : BORDER}`,
              borderRadius: 6, padding: '7px 10px', color: TEXT, fontSize: 13,
              fontFamily: 'ui-monospace, Consolas, monospace', outline: 'none',
            }}
          />
          {nameErr && <div style={{ fontSize: 11, color: '#f85149', marginTop: 4 }}>{nameErr}</div>}
        </div>

        {/* main checkbox — only for plain Class */}
        {kind === 'Class' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 22 }}>
            <input type="checkbox" checked={withMain} onChange={(e) => setWithMain(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: ACCENT }} />
            <span style={{ fontSize: 13, color: TEXT }}>Generate <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#79c0ff' }}>main</code> method</span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: kind !== 'Class' ? 22 : 0 }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT_DIM, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
