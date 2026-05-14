import { useState, useRef, useEffect } from 'react';
import { useModelStore } from '../store/modelStore';
import { generateJavaCode } from '../utils/javaCodeGen';
import { runJava } from '../utils/javaRunner';

const BG = '#0d1117';
const BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACCENT = '#2563eb';
const ERR = '#f85149';
const SUCCESS = '#3fb950';

function toPackageName(name) {
  return (name || 'model').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'model';
}

function toClassName(name) {
  const sanitized = (name || 'Class')
    .replace(/[^a-zA-Z0-9_$\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return sanitized || 'GeneratedClass';
}

export default function JavaRunnerPanel({ onClose }) {
  const metaModel = useModelStore((s) => s.metaModel);
  const instanceModels = useModelStore((s) => s.instanceModels);
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  const notify = useModelStore((s) => s.notify);

  const [selectedIMId, setSelectedIMId] = useState(() => instanceModels[0]?.id ?? '');
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [height, setHeight] = useState(300);

  const outputRef = useRef(null);
  const dragRef = useRef({ active: false, startY: 0, startH: 0 });

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const handleRun = async () => {
    if (conformanceResults.length > 0) {
      notify(`Cannot run: ${conformanceResults.length} conformance issue(s) must be resolved first.`);
      return;
    }
    const im = instanceModels.find((m) => m.id === selectedIMId);
    if (!im) {
      notify('Select an instance model to run.');
      return;
    }

    setRunning(true);
    setOutput({ phase: 'compiling', stdout: '', stderr: '' });

    const pkgName = `iml.${toPackageName(metaModel.name)}`;
    const files = generateJavaCode(metaModel, instanceModels).map((f) => ({
      name: f.path,
      content: f.content,
    }));

    const mainClass = `${pkgName}.${toClassName(im.name)}`;
    const result = await runJava(files, mainClass);
    setRunning(false);
    setOutput(result);
  };

  // Drag-to-resize handle
  const onDragStart = (e) => {
    dragRef.current = { active: true, startY: e.clientY, startH: height };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragRef.current.active) return;
    const delta = dragRef.current.startY - e.clientY;
    setHeight(Math.max(150, Math.min(600, dragRef.current.startH + delta)));
  };
  const onDragEnd = () => {
    dragRef.current.active = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };

  const hasError = output && (output.exitCode !== 0 || output.phase === 'network' || output.phase === 'http');
  const statusColor = !output ? TEXT_DIM : output.phase === 'compiling' ? TEXT_DIM : hasError ? ERR : SUCCESS;
  const statusLabel = !output ? 'Ready'
    : output.phase === 'compiling' ? 'Compiling…'
    : output.phase === 'compile' && output.exitCode !== 0 ? 'Compile error'
    : output.phase === 'network' || output.phase === 'http' ? 'Connection error'
    : output.exitCode !== 0 ? 'Runtime error'
    : 'Success';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
      height,
      background: BG,
      borderTop: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      color: TEXT,
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          height: 5, cursor: 'row-resize', flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${BORDER}`,
        }}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
        background: '#161b22',
      }}>
        {/* Terminal icon */}
        <svg viewBox="0 0 16 16" width="14" height="14" fill={TEXT_DIM}>
          <path d="M0 2.5A1.5 1.5 0 011.5 1h13A1.5 1.5 0 0116 2.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13.5v-11zm4.146 3.646a.5.5 0 000 .708l1.5 1.5-1.5 1.5a.5.5 0 00.708.708l1.854-1.854a.5.5 0 000-.708L4.854 6.146a.5.5 0 00-.708 0zM7.5 9.5a.5.5 0 000 1h3a.5.5 0 000-1h-3z"/>
        </svg>
        <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.04em', color: TEXT_DIM, textTransform: 'uppercase' }}>
          Java Runner
        </span>

        <div style={{ width: 1, height: 16, background: BORDER, margin: '0 4px' }} />

        {/* Instance model selector */}
        <select
          value={selectedIMId}
          onChange={(e) => setSelectedIMId(e.target.value)}
          disabled={running}
          style={{
            background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
            borderRadius: 5, padding: '2px 6px', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {instanceModels.length === 0
            ? <option value="">No instance models</option>
            : instanceModels.map((im) => (
              <option key={im.id} value={im.id}>{im.name || '(unnamed)'}</option>
            ))
          }
        </select>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running || instanceModels.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            background: running ? '#21262d' : ACCENT,
            color: running ? TEXT_DIM : '#fff',
            border: 'none', cursor: running ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {running
            ? <>
                <SpinnerIcon />
                Running…
              </>
            : <>
                <PlayIcon />
                Run
              </>
          }
        </button>

        <div style={{ flex: 1 }} />

        {/* Status badge */}
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>

        <div style={{ width: 1, height: 16, background: BORDER, margin: '0 4px' }} />

        {/* Clear */}
        <button onClick={() => setOutput(null)} title="Clear output"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: '0 4px', fontSize: 12, fontFamily: 'inherit' }}>
          Clear
        </button>

        {/* Close */}
        <button onClick={onClose} title="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, padding: '0 4px', fontSize: 18, lineHeight: 1 }}>
          ×
        </button>
      </div>

      {/* Output area */}
      <div ref={outputRef} style={{ flex: 1, overflow: 'auto', padding: '10px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
        {!output && (
          <span style={{ color: TEXT_DIM }}>
            Select an instance model and click Run to compile and execute.
          </span>
        )}

        {output && output.phase === 'compiling' && (
          <span style={{ color: TEXT_DIM }}>Compiling…</span>
        )}

        {output && output.phase !== 'compiling' && (
          <>
            {output.stdout && (
              <span style={{ color: TEXT }}>{output.stdout}</span>
            )}
            {output.stderr && (
              <span style={{ color: ERR }}>{output.stderr}</span>
            )}
            {!output.stdout && !output.stderr && output.exitCode === 0 && (
              <span style={{ color: TEXT_DIM }}>(no output)</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
      <path d="M2 1.5l8 4.5-8 4.5V1.5z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"
      style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="6" cy="6" r="4" strokeOpacity="0.25" />
      <path d="M10 6a4 4 0 00-4-4" strokeLinecap="round" />
    </svg>
  );
}
