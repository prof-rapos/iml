import { useState } from 'react';
import { useModelStore } from '../store/modelStore';
import { Network, FileSliders, Workflow, Code2, ShieldCheck } from 'lucide-react';

const MODULES = [
  {
    id: 'structural',
    title: 'Structural Modeling',
    description: 'Define meta-models, create object instances, and validate conformance.',
    color: '#0077CA',
    available: true,
  },
  {
    id: 'transformations',
    title: 'Model Transformations',
    description: 'Define and apply model-to-model transformations between meta-models.',
    color: '#7c3aed',
    available: true,
  },
  {
    id: 'behavioural',
    title: 'Behavioural Modeling',
    description: 'Model capsules, protocols, and state machines in UML-RT style.',
    color: '#d97706',
    available: false,
  },
  {
    id: 'ide',
    title: 'Code Explorer',
    description: 'Edit, run, and debug generated code in an integrated development environment.',
    color: '#059669',
    available: true,
  },
  {
    id: 'testing',
    title: 'Model-Based Testing',
    description: 'Verify models and generate test cases using symbolic execution.',
    color: '#dc2626',
    available: false,
  },
];

const ICONS = {
  structural:      <Network      size={26} strokeWidth={1.6} />,
  transformations: <FileSliders  size={26} strokeWidth={1.6} />,
  behavioural:     <Workflow     size={26} strokeWidth={1.6} />,
  ide:             <Code2        size={26} strokeWidth={1.6} />,
  testing:         <ShieldCheck  size={26} strokeWidth={1.6} />,
};

// ── Card ──────────────────────────────────────────────────────────────────────
function ModuleCard({ mod, onSelect, onComingSoon }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => mod.available ? onSelect(mod.id) : onComingSoon(mod)}
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        width: '100%', textAlign: 'left',
        background: hover ? '#243347' : '#1e293b',
        border: `1px solid ${hover ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12, overflow: 'hidden',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: hover ? '0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {/* Coloured icon band */}
      <div style={{
        width: 72, flexShrink: 0, alignSelf: 'stretch',
        background: mod.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        opacity: mod.available ? 1 : 0.5,
      }}>
        {ICONS[mod.id]}
      </div>

      {/* Text */}
      <div style={{ flex: 1, padding: '16px 20px' }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: mod.available ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
          marginBottom: 4, letterSpacing: '-0.2px',
        }}>
          {mod.title}
        </div>
        <div style={{
          fontSize: 12, color: mod.available ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
          lineHeight: 1.5,
        }}>
          {mod.description}
        </div>
      </div>

      {/* Right status */}
      <div style={{ paddingRight: 20, flexShrink: 0 }}>
        {mod.available
          ? <span style={{ fontSize: 20, color: mod.color, opacity: hover ? 1 : 0.7, transition: 'opacity 0.15s' }}>›</span>
          : <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10, padding: '3px 8px',
            }}>Coming Soon</span>
        }
      </div>
    </button>
  );
}

// ── Coming Soon modal ─────────────────────────────────────────────────────────
function ComingSoonModal({ mod, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '28px 32px', maxWidth: 360, width: '90%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          color: '#f1f5f9', fontFamily: 'var(--iml-font-sans)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 10, background: mod.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', marginBottom: 16,
        }}>
          {ICONS[mod.id]}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{mod.title}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 24 }}>
          {mod.description}
          <br /><br />
          This module is currently under development and will be available in a future release.
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '9px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
            color: '#f1f5f9', fontSize: 13, fontWeight: 600,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Landing page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const setAppView = useModelStore((s) => s.setAppView);
  const [comingSoon, setComingSoon] = useState(null);

  return (
    <div style={{
      height: '100vh', background: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--iml-font-sans)', padding: '0 24px',
      overflowY: 'auto',
    }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 12 }}>
        <div style={{
          width: 72, height: 72, background: '#fff',
          borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <img src={`${import.meta.env.BASE_URL}logos/logo.png`} alt="IML" style={{ width: 64, height: 64, objectFit: 'contain' }} />
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Instructional Modeling Language
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            A structured environment for model-driven development.
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 36, letterSpacing: '0.02em' }}>
        Select a module to get started
      </div>

      {/* Module cards */}
      <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MODULES.map((mod) => (
          <ModuleCard
            key={mod.id}
            mod={mod}
            onSelect={(id) => setAppView(id)}
            onComingSoon={setComingSoon}
          />
        ))}
      </div>

      {comingSoon && (
        <ComingSoonModal mod={comingSoon} onClose={() => setComingSoon(null)} />
      )}
    </div>
  );
}
