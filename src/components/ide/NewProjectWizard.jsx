import { useState } from 'react';
import { packageToDir } from '../../store/ideStore';

const BG = '#161b22';
const BORDER = 'rgba(255,255,255,0.12)';
const TEXT = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACCENT = '#2563eb';
const INPUT_BG = '#0d1117';

function Field({ label, value, onChange, placeholder, error, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT_DIM, marginBottom: 5 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: INPUT_BG, border: `1px solid ${error ? '#f85149' : BORDER}`,
          borderRadius: 6, padding: '7px 10px', color: TEXT, fontSize: 13,
          fontFamily: 'ui-monospace, Consolas, monospace', outline: 'none',
        }}
      />
      {error && <div style={{ fontSize: 11, color: '#f85149', marginTop: 4 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function validatePackage(v) {
  if (!v.trim()) return null; // optional
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(v.trim()))
    return 'Use lowercase identifiers separated by dots (e.g. com.example.hello)';
  return null;
}

function validateClass(v) {
  if (!v.trim()) return 'Class name is required';
  if (!/^[A-Z][a-zA-Z0-9_]*$/.test(v.trim())) return 'Must start with uppercase letter (e.g. Main)';
  return null;
}

export default function NewProjectWizard({ onConfirm, onCancel }) {
  const [pkg, setPkg]           = useState('');
  const [className, setClassName] = useState('Main');
  const [withMain, setWithMain]   = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const pkgErr = submitted ? validatePackage(pkg)    : null;
  const clsErr = submitted ? validateClass(className) : null;

  const handleSubmit = () => {
    setSubmitted(true);
    if (validatePackage(pkg) || validateClass(className)) return;

    const pkgTrim = pkg.trim();
    const clsTrim = className.trim();
    const path    = pkgTrim ? `${packageToDir(pkgTrim)}/${clsTrim}.java` : `${clsTrim}.java`;

    const pkgLine  = pkgTrim ? `package ${pkgTrim};\n\n` : '';
    const mainBody = withMain
      ? `\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n`
      : '\n    \n';
    const content = `${pkgLine}public class ${clsTrim} {${mainBody}}\n`;

    onConfirm({ packageName: pkgTrim, files: [{ path, content }], activePath: path });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '28px 28px 22px', width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: TEXT, fontFamily: 'var(--iml-font-sans)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>New Project</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 20 }}>Configure your Java project</div>

        <Field
          label="Package name (optional)"
          value={pkg}
          onChange={setPkg}
          placeholder="com.example.hello"
          error={pkgErr}
          hint="Leave blank to place files in the default package"
        />
        <Field label="Main class name" value={className} onChange={setClassName} placeholder="Main" error={clsErr} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 22 }}>
          <input type="checkbox" checked={withMain} onChange={(e) => setWithMain(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: ACCENT }} />
          <span style={{ fontSize: 13, color: TEXT }}>Generate <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#79c0ff' }}>main</code> method</span>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
