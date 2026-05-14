import { useState, useRef, useEffect } from 'react';
import { runJava } from '../../utils/javaRunner';
import { findMainClasses } from '../../store/ideStore';

const BG = '#0d1117';
const BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACCENT = '#2563eb';
const ERR = '#f85149';
const SUCCESS = '#3fb950';
const HEADER_BG = '#161b22';

export default function IDEOutputPanel({ files }) {
  const [output, setOutput]   = useState(null);
  const [running, setRunning] = useState(false);
  const [height, setHeight]   = useState(220);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedMain, setSelectedMain] = useState(null);

  const outputRef = useRef(null);
  const dragRef   = useRef({ active: false, startY: 0, startH: 0 });

  const mains = findMainClasses(files);

  // Auto-select when mains list changes
  useEffect(() => {
    if (mains.length === 0) { setSelectedMain(null); return; }
    if (!selectedMain || !mains.find((m) => m.className === selectedMain)) {
      setSelectedMain(mains[0].className);
    }
  }, [files]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const handleRun = async () => {
    if (!selectedMain) return;
    setCollapsed(false);
    setRunning(true);
    setOutput({ phase: 'compiling' });

    const result = await runJava(
      files.map((f) => ({ name: f.path, content: f.content })),
      selectedMain,
    );
    setRunning(false);
    setOutput(result);
  };

  const onDragStart = (e) => {
    dragRef.current = { active: true, startY: e.clientY, startH: height };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragRef.current.active) return;
    const delta = dragRef.current.startY - e.clientY;
    setHeight(Math.max(80, Math.min(600, dragRef.current.startH + delta)));
  };
  const onDragEnd = () => {
    dragRef.current.active = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };

  const hasError = output && output.phase !== 'compiling' && output.exitCode !== 0;
  const statusColor = !output ? TEXT_DIM
    : output.phase === 'compiling' ? TEXT_DIM
    : hasError ? ERR : SUCCESS;
  const statusLabel = !output ? 'Ready'
    : output.phase === 'compiling' ? 'Running…'
    : output.phase === 'compile' && output.exitCode !== 0 ? 'Compile error'
    : output.phase === 'network' || output.phase === 'http' ? 'Connection error'
    : output.exitCode !== 0 ? 'Runtime error'
    : 'Success';

  return (
    <div style={{
      flexShrink: 0,
      height: collapsed ? 32 : height,
      borderTop: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      background: BG,
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      fontSize: 13, color: TEXT,
      transition: 'height 0.15s ease',
      minHeight: collapsed ? 32 : 80,
    }}>
      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={onDragStart}
          style={{ height: 4, cursor: 'row-resize', flexShrink: 0, background: 'rgba(255,255,255,0.03)' }}
        />
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 32, flexShrink: 0,
        background: HEADER_BG, borderBottom: collapsed ? 'none' : `1px solid ${BORDER}`,
        cursor: 'pointer',
      }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill={TEXT_DIM}>
          <path d="M0 2.5A1.5 1.5 0 011.5 1h13A1.5 1.5 0 0116 2.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13.5v-11zm4.146 3.646a.5.5 0 000 .708l1.5 1.5-1.5 1.5a.5.5 0 00.708.708l1.854-1.854a.5.5 0 000-.708L4.854 6.146a.5.5 0 00-.708 0zM7.5 9.5a.5.5 0 000 1h3a.5.5 0 000-1h-3z"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_DIM }}>
          Output
        </span>
        <span style={{ fontSize: 9, color: TEXT_DIM }}>{collapsed ? '▸' : '▾'}</span>

        <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()} />

        {/* Main class selector */}
        {mains.length > 1 && (
          <select
            value={selectedMain ?? ''}
            onChange={(e) => setSelectedMain(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            disabled={running}
            style={{
              background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
              borderRadius: 4, padding: '1px 6px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', maxWidth: 200,
            }}
          >
            {mains.map((m) => <option key={m.className} value={m.className}>{m.className}</option>)}
          </select>
        )}

        {/* Run */}
        <button
          onClick={(e) => { e.stopPropagation(); handleRun(); }}
          disabled={running || mains.length === 0}
          title={mains.length === 0 ? 'No main() method found' : `Run ${selectedMain}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: running || mains.length === 0 ? '#21262d' : ACCENT,
            color: running || mains.length === 0 ? TEXT_DIM : '#fff',
            border: 'none', cursor: running || mains.length === 0 ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {running ? <><SpinnerIcon /> Running…</> : <><PlayIcon /> Run</>}
        </button>

        <span style={{ fontSize: 10, color: statusColor, fontWeight: 500, minWidth: 80, textAlign: 'right' }}>{statusLabel}</span>

        <button onClick={(e) => { e.stopPropagation(); setOutput(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, fontSize: 11, padding: '0 2px', fontFamily: 'inherit' }}>
          Clear
        </button>
      </div>

      {/* Output */}
      {!collapsed && (
        <div ref={outputRef} style={{ flex: 1, overflow: 'auto', padding: '8px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
          {!output && <span style={{ color: TEXT_DIM }}>Click Run to compile and execute.</span>}
          {output?.phase === 'compiling' && <span style={{ color: TEXT_DIM }}>Compiling…</span>}
          {output && output.phase !== 'compiling' && (
            <>
              {output.stdout && <span style={{ color: TEXT }}>{output.stdout}</span>}
              {output.stderr && <span style={{ color: ERR }}>{output.stderr}</span>}
              {!output.stdout && !output.stderr && output.exitCode === 0 && <span style={{ color: TEXT_DIM }}>(no output)</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor"><path d="M2 1.5l8 4.5-8 4.5V1.5z"/></svg>;
}
function SpinnerIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="6" cy="6" r="4" strokeOpacity="0.25"/>
      <path d="M10 6a4 4 0 00-4-4" strokeLinecap="round"/>
    </svg>
  );
}
