import { useRef, useEffect, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { findMainClasses } from '../../store/ideStore';

const RUNNER_URL = import.meta.env.VITE_JAVA_RUNNER_URL || 'https://iml-java-runner.fly.dev';
const WS_URL = RUNNER_URL.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws');

const BORDER  = 'rgba(255,255,255,0.10)';
const TEXT    = '#e6edf3';
const TEXT_DIM = '#8b949e';
const ACCENT  = '#2563eb';
const HEADER_BG = '#161b22';

const TERM_THEME = {
  background:        '#0d1117',
  foreground:        '#e6edf3',
  cursor:            '#e6edf3',
  cursorAccent:      '#0d1117',
  selectionBackground: 'rgba(37,99,235,0.3)',
  black:             '#0d1117',
  red:               '#f85149',
  green:             '#3fb950',
  yellow:            '#e3b341',
  blue:              '#79c0ff',
  magenta:           '#d2a8ff',
  cyan:              '#39d353',
  white:             '#e6edf3',
  brightBlack:       '#6e7681',
  brightRed:         '#f85149',
  brightGreen:       '#56d364',
  brightYellow:      '#e3b341',
  brightBlue:        '#79c0ff',
  brightMagenta:     '#d2a8ff',
  brightCyan:        '#39d353',
  brightWhite:       '#ffffff',
};

export default function IDETerminal({ files }) {
  const mountRef    = useRef(null);  // DOM element for xterm
  const termRef     = useRef(null);  // Terminal instance
  const fitRef      = useRef(null);  // FitAddon instance
  const wsRef       = useRef(null);  // WebSocket
  const dragRef     = useRef({ active: false, startY: 0, startH: 0 });

  const [height, setHeight]       = useState(260);
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning]     = useState(false);
  const [status, setStatus]       = useState('ready');
  const [selectedMain, setSelectedMain] = useState(null);

  const mains = findMainClasses(files);

  // Keep selectedMain in sync with available mains
  useEffect(() => {
    if (mains.length === 0) { setSelectedMain(null); return; }
    if (!selectedMain || !mains.find((m) => m.className === selectedMain)) {
      setSelectedMain(mains[0].className);
    }
  }, [files]);

  // Initialise terminal once
  useEffect(() => {
    if (!mountRef.current) return;

    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 2000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(mountRef.current);
    fit.fit();

    term.writeln('\x1b[2mIML Java Terminal — click Run to execute\x1b[0m');

    // Forward keystrokes to the running process
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Forward resize events to the server
    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    termRef.current = term;
    fitRef.current  = fit;

    // Re-fit when the container resizes
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(mountRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      wsRef.current?.close();
    };
  }, []);

  // Re-fit when collapsed state or height changes
  useEffect(() => {
    if (!collapsed) setTimeout(() => fitRef.current?.fit(), 50);
  }, [collapsed, height]);

  // ── Run ───────────────────────────────────────────────────────────────────
  const handleRun = () => {
    if (!selectedMain || running) return;
    const term = termRef.current;

    // Close any existing session
    wsRef.current?.close();

    term.reset();
    term.writeln(`\x1b[2m▶  ${selectedMain}\x1b[0m`);
    setCollapsed(false);
    setRunning(true);
    setStatus('compiling');
    term.focus();

    const { cols, rows } = term;
    const ws = new WebSocket(`${WS_URL}/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'run',
        files: files.map((f) => ({ name: f.path, content: f.content })),
        mainClass: selectedMain,
        cols,
        rows,
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'data':
          term.write(msg.data);
          break;
        case 'status':
          setStatus(msg.phase);
          if (msg.phase === 'compiling') {
            term.write('\x1b[2mCompiling…\x1b[0m');
          } else if (msg.phase === 'running') {
            // Overwrite the "Compiling…" line with a success tick, then blank line
            term.write('\x1b[2K\r\x1b[32m✓ Compiled\x1b[0m\r\n\n');
          }
          break;
        case 'error':
          term.write(`\x1b[31m${msg.data}\x1b[0m`);
          setRunning(false);
          setStatus('error');
          break;
        case 'exit':
          setRunning(false);
          setStatus(msg.code === 0 ? 'done' : 'error');
          term.writeln(
            `\r\n\x1b[2m[Exited with code ${msg.code}]\x1b[0m`
          );
          break;
      }
    };

    ws.onerror = () => {
      term.writeln('\x1b[31mConnection error — is the runner service up?\x1b[0m');
      setRunning(false);
      setStatus('error');
    };

    ws.onclose = () => {
      if (running) setRunning(false);
    };
  };

  const handleKill = () => {
    wsRef.current?.send(JSON.stringify({ type: 'kill' }));
    termRef.current?.writeln('\r\n\x1b[33m[Killed]\x1b[0m');
    setRunning(false);
    setStatus('ready');
  };

  const handleClear = () => termRef.current?.reset();

  // ── Drag-to-resize ────────────────────────────────────────────────────────
  const onDragStart = (e) => {
    dragRef.current = { active: true, startY: e.clientY, startH: height };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e) => {
    if (!dragRef.current.active) return;
    const delta = dragRef.current.startY - e.clientY;
    setHeight(Math.max(80, Math.min(700, dragRef.current.startH + delta)));
  };
  const onDragEnd = () => {
    dragRef.current.active = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };

  const statusColor =
    status === 'done'  ? '#3fb950' :
    status === 'error' ? '#f85149' :
    TEXT_DIM;
  const statusLabel =
    status === 'compiling' ? 'Compiling…' :
    status === 'running'   ? 'Running' :
    status === 'done'      ? 'Done' :
    status === 'error'     ? 'Error' :
    'Ready';

  return (
    <div style={{
      flexShrink: 0,
      height: collapsed ? 32 : height,
      display: 'flex', flexDirection: 'column',
      borderTop: `1px solid ${BORDER}`,
      background: '#0d1117',
      fontFamily: 'var(--iml-font-sans)',
      transition: 'height 0.12s ease',
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
      <div
        style={{
          height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px',
          background: HEADER_BG,
          borderBottom: collapsed ? 'none' : `1px solid ${BORDER}`,
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        {/* Terminal icon */}
        <svg viewBox="0 0 16 16" width="12" height="12" fill={TEXT_DIM}>
          <path d="M0 2.5A1.5 1.5 0 011.5 1h13A1.5 1.5 0 0116 2.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13.5v-11zm4.146 3.646a.5.5 0 000 .708l1.5 1.5-1.5 1.5a.5.5 0 00.708.708l1.854-1.854a.5.5 0 000-.708L4.854 6.146a.5.5 0 00-.708 0zM7.5 9.5a.5.5 0 000 1h3a.5.5 0 000-1h-3z"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEXT_DIM }}>
          Terminal
        </span>
        <span style={{ fontSize: 9, color: TEXT_DIM }}>{collapsed ? '▸' : '▾'}</span>

        {/* Controls — stop propagation so header clicks don't collapse */}
        <div style={{ flex: 1 }} onClick={(e) => e.stopPropagation()} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {/* Main class selector */}
          {mains.length > 1 && (
            <select
              value={selectedMain ?? ''}
              onChange={(e) => setSelectedMain(e.target.value)}
              disabled={running}
              style={{
                background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
                borderRadius: 4, padding: '1px 6px', fontSize: 11, cursor: 'pointer',
                fontFamily: 'ui-monospace, Consolas, monospace', maxWidth: 220,
              }}
            >
              {mains.map((m) => <option key={m.className} value={m.className}>{m.className}</option>)}
            </select>
          )}

          {/* Run / Kill */}
          {running ? (
            <button onClick={handleKill} style={btnStyle('#dc2626')}>
              ■ Kill
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={mains.length === 0}
              title={mains.length === 0 ? 'No main() method found' : `Run ${selectedMain}`}
              style={btnStyle(mains.length === 0 ? '#21262d' : ACCENT, mains.length === 0)}
            >
              <PlayIcon /> Run
            </button>
          )}

          <span style={{ fontSize: 10, color: statusColor, fontWeight: 500, minWidth: 64, textAlign: 'right' }}>
            {statusLabel}
          </span>

          <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, fontSize: 11, padding: '0 2px', fontFamily: 'inherit' }}>
            Clear
          </button>
        </div>
      </div>

      {/* xterm mount point */}
      {!collapsed && (
        <div
          ref={mountRef}
          style={{ flex: 1, overflow: 'hidden', padding: '4px 0' }}
        />
      )}
    </div>
  );
}

const btnStyle = (bg, disabled) => ({
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: bg, color: disabled ? TEXT_DIM : '#fff',
  border: 'none', cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
});

function PlayIcon() {
  return <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor"><path d="M2 1.5l8 4.5-8 4.5V1.5z"/></svg>;
}
