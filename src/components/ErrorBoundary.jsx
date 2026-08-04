import { Component } from 'react';

// React error boundaries must be class components — there's no hook
// equivalent. Nothing in this app had one before this review: a crash
// anywhere in the render tree (a malformed import slipping past
// validation, or any other future bug) unmounted straight to a blank white
// screen with no way back except a reload, silently losing whatever wasn't
// exported (there's no autosave — see the future-backlog note on that).
// This doesn't fix the underlying bugs; it's a last-resort net so a crash
// is at least recoverable and legible instead of a dead page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('IML Studio crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: '#0d1117', color: '#e6edf3',
        fontFamily: 'var(--iml-font-sans, -apple-system, sans-serif)',
        padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 34 }}>⚠</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</div>
        <div style={{ fontSize: 13.5, color: '#8b949e', maxWidth: 420, lineHeight: 1.6 }}>
          IML Studio hit an unexpected error and can't continue safely. If you loaded a
          file just before this happened, it's likely the cause — try reloading and,
          if the file is the one you imported, double-check it's a valid <code>.iml.json</code> export.
          Any work since your last export is not saved and will be lost on reload.
        </div>
        <div style={{ fontSize: 11, color: '#6e7681', fontFamily: 'var(--iml-font-mono, monospace)', maxWidth: 500, wordBreak: 'break-word' }}>
          {this.state.error.message}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
            background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
