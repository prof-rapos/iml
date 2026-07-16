import { useState } from 'react';
import { TEXT, TEXT_DIM } from '../theme';

const BORDER   = 'rgba(255,255,255,0.10)';
const HEADER_BG = '#161b22';

const KIND_SYMBOL = { REFERENCE: '→', COMPOSITION: '◆' };

function ClassItem({ cls, metaModel, instanceModels }) {
  const [open, setOpen] = useState(false);

  const parentRel = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === cls.id);
  const parentCls = parentRel ? metaModel.classes.find((c) => c.id === parentRel.target) : null;
  const outRels   = metaModel.relations.filter((r) => r.source === cls.id && r.kind !== 'INHERITANCE');

  const objCount = instanceModels
    ? instanceModels.reduce((n, im) => n + im.objects.filter((o) => o.classId === cls.id).length, 0)
    : 0;

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
          userSelect: 'none',
          background: open ? 'rgba(255,255,255,0.05)' : 'transparent',
        }}
      >
        <span style={{ fontSize: 10, color: TEXT_DIM, width: 8, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cls.name}
          {cls.abstract && <em style={{ color: TEXT_DIM, fontWeight: 400, fontSize: 10 }}> ‹abs›</em>}
        </span>
        {objCount > 0 && (
          <span style={{ fontSize: 10, color: TEXT_DIM, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
            {objCount}
          </span>
        )}
      </div>

      {open && (
        <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
          {parentCls && (
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>
              extends <span style={{ color: '#79c0ff' }}>{parentCls.name}</span>
            </div>
          )}

          {cls.attributes.map((a) => (
            <div key={a.id} style={{ fontSize: 11, color: TEXT_DIM, padding: '1px 0' }}>
              {a.name}: <span style={{ color: '#e3b341' }}>{a.type}</span>
            </div>
          ))}

          {outRels.map((r) => {
            const tgtCls = metaModel.classes.find((c) => c.id === r.target);
            return (
              <div key={r.id} style={{ fontSize: 11, color: TEXT_DIM, padding: '1px 0' }}>
                <span style={{ color: r.kind === 'COMPOSITION' ? '#d2a8ff' : '#79c0ff' }}>
                  {KIND_SYMBOL[r.kind] ?? r.kind}
                </span>{' '}
                {r.name || '(unnamed)'} → <span style={{ color: '#79c0ff' }}>{tgtCls?.name ?? '?'}</span>
              </div>
            );
          })}

          {/* Objects grouped by instance model */}
          {instanceModels?.map((im) => {
            const objs = im.objects.filter((o) => o.classId === cls.id);
            if (objs.length === 0) return null;
            return (
              <div key={im.id} style={{ marginTop: 5 }}>
                <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                  {im.name}
                </div>
                {objs.map((o) => (
                  <div key={o.id} style={{ fontSize: 11, color: TEXT, padding: '1px 0' }}>
                    · {o.name || '(unnamed)'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ModelPanel({ label, data, side }) {
  const isSource = side === 'source';

  return (
    <div style={{
      width: 268, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderRight: isSource ? `1px solid ${BORDER}` : 'none',
      borderLeft: !isSource ? `1px solid ${BORDER}` : 'none',
      background: '#0d1117',
    }}>
      {/* Header */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        background: HEADER_BG,
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {data && (
          <span style={{ fontSize: 10, color: '#3fb950', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            ✓ {data.metaModel.name}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {!data ? (
          <div style={{ padding: 20, textAlign: 'center', color: TEXT_DIM, fontSize: 12, lineHeight: 1.7 }}>
            No model loaded.<br />
            Use <strong style={{ color: TEXT }}>Load {isSource ? 'Source' : 'Target'}</strong> above.
          </div>
        ) : (
          <>
            <div style={{ padding: '2px 8px 4px', fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Classes ({data.metaModel.classes.length})
            </div>
            {data.metaModel.classes.map((cls) => (
              <ClassItem
                key={cls.id}
                cls={cls}
                metaModel={data.metaModel}
                instanceModels={isSource ? data.instanceModels : null}
              />
            ))}

            {isSource && data.instanceModels?.length > 0 && (
              <div style={{ marginTop: 14, padding: '0 8px' }}>
                <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Instance Models ({data.instanceModels.length})
                </div>
                {data.instanceModels.map((im) => (
                  <div key={im.id} style={{ fontSize: 12, color: TEXT, marginBottom: 3 }}>
                    {im.name}{' '}
                    <span style={{ color: TEXT_DIM, fontSize: 11 }}>({im.objects.length} obj)</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
