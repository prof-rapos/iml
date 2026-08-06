import { useState } from 'react';
import { useModelStore } from '../store/modelStore';
import { useOverlayClose } from '../utils/useOverlayClose';
import { validateModelShape } from '../utils/modelHelpers';
import { EXAMPLES } from '../utils/examples';
import { TEXT, TEXT_DIM } from './theme';

const BORDER = 'rgba(255,255,255,0.10)';

export default function LoadExampleModal({ onClose }) {
  const loadFromJSON = useModelStore((s) => s.loadFromJSON);
  const notify = useModelStore((s) => s.notify);
  const [loadingFile, setLoadingFile] = useState(null);

  const handleLoad = async (ex) => {
    setLoadingFile(ex.file);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/${ex.file}`);
      if (!res.ok) throw new Error(`couldn't fetch the example file (HTTP ${res.status})`);
      const data = await res.json();
      const shapeError = validateModelShape(data, true);
      if (shapeError) throw new Error(shapeError);
      loadFromJSON(data);
      onClose();
    } catch (err) {
      notify(`Couldn't load "${ex.name}": ${err.message}`);
      setLoadingFile(null);
    }
  };

  const overlayClose = useOverlayClose(onClose);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      {...overlayClose}
    >
      <div
        style={{ background: '#0d1117', border: `1px solid ${BORDER}`, borderRadius: 10, width: 440, maxHeight: '75vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)', color: TEXT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Load Example Model</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_DIM, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 12, lineHeight: 1.5 }}>
            Loading an example replaces your current meta-model and instance models — export first if you want to keep them.
          </div>
          {EXAMPLES.map((ex) => {
            const loading = loadingFile === ex.file;
            return (
              <button
                key={ex.file}
                onClick={() => handleLoad(ex)}
                disabled={!!loadingFile}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 14px', marginBottom: 8, borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.03)',
                  color: TEXT, cursor: loadingFile ? 'default' : 'pointer',
                  opacity: loadingFile && !loading ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  {ex.name}{loading ? ' — loading…' : ''}
                </div>
                <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>{ex.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
