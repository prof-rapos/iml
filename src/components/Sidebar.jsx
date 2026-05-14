import { useState, useRef, useEffect } from 'react';
import { useModelStore, getAllAttributes } from '../store/modelStore';


const EDGE_TYPES  = ['INHERITANCE', 'REFERENCE', 'COMPOSITION'];
const EDGE_COLORS = { INHERITANCE:  'var(--iml-inheritance)', 
					  REFERENCE:    'var(--iml-reference)', 
					  COMPOSITION:  'var(--iml-composition)' };

export default function Sidebar() {
  const mode              = useModelStore((s) => s.mode);
  const setMode           = useModelStore((s) => s.setMode);
  const addClass          = useModelStore((s) => s.addClass);
  const addObject         = useModelStore((s) => s.addObject);
  const metaModel         = useModelStore((s) => s.metaModel);
  const nodes             = useModelStore((s) => s.nodes);
  const pendingEdgeType   = useModelStore((s) => s.pendingEdgeType);
  const setPendingEdgeType  = useModelStore((s) => s.setPendingEdgeType);
  const pendingRelationId   = useModelStore((s) => s.pendingRelationId);
  const setPendingRelationId = useModelStore((s) => s.setPendingRelationId);
  const rebuildCanvas     = useModelStore((s) => s.rebuildCanvas);
  const instanceModels    = useModelStore((s) => s.instanceModels);
  const currentIMIndex    = useModelStore((s) => s.currentIMIndex);
  const addInstanceModel    = useModelStore((s) => s.addInstanceModel);
  const switchInstanceModel = useModelStore((s) => s.switchInstanceModel);
  const deleteInstanceModel = useModelStore((s) => s.deleteInstanceModel);
  const updateMetaModelName     = useModelStore((s) => s.updateMetaModelName);
  const updateInstanceModelName = useModelStore((s) => s.updateInstanceModelName);
  const clearMetaModel      = useModelStore((s) => s.clearMetaModel);
  const clearInstanceModel  = useModelStore((s) => s.clearInstanceModel);
  const instanceModel       = useModelStore((s) => s.instanceModels[s.currentIMIndex]);
  const conformanceResults  = useModelStore((s) => s.conformanceResults);
  const metaModelForCoEvo   = metaModel;
  const coEvoWarnings = (instanceModel?.objects ?? []).flatMap((obj) => {
    const cls = metaModelForCoEvo.classes.find((c) => c.id === obj.classId);
    if (!cls) return [];
    const allAttrIds = new Set(getAllAttributes(obj.classId, metaModelForCoEvo).map((a) => a.id));
    const orphanSlots = obj.slots.filter((sl) => !allAttrIds.has(sl.attrId));
    return orphanSlots.length > 0
      ? [`"${obj.name}": ${orphanSlots.length} stale slot(s)`]
      : [];
  });

  const handleAddClass = (isAbstract) => {
    const id = addClass(isAbstract);
    const existing = nodes.filter((n) => n.type === 'classNode');
    const col = existing.length % 4;
    const row = Math.floor(existing.length / 4);
    useModelStore.setState((s) => ({
      nodes: [...s.nodes, {
        id, type: 'classNode',
        position: { x: 80 + col * 240, y: 80 + row * 200 },
        data: { classId: id },
      }],
    }));
  };

  const handleAddObject = (classId) => {
    const id = addObject(classId);
    if (!id) return;
    const existing = nodes.filter((n) => n.type === 'objectNode');
    const col = existing.length % 4;
    const row = Math.floor(existing.length / 4);
    useModelStore.setState((s) => ({
      nodes: [...s.nodes, {
        id, type: 'objectNode',
        position: { x: 80 + col * 240, y: 80 + row * 200 },
        data: { objectId: id },
      }],
    }));
  };

  const [issueOpen, setIssueOpen] = useState(false);
  const issueRef = useRef(null);
  useEffect(() => {
    if (!issueOpen) return;
    const handler = (e) => {
      if (issueRef.current && !issueRef.current.contains(e.target)) setIssueOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [issueOpen]);

  const [confirm, setConfirm] = useState(null); // { message, onConfirm }
  const ask = (message, onConfirm) => setConfirm({ message, onConfirm });
  const dismiss = () => setConfirm(null);

  const switchMode = (m) => { setMode(m); rebuildCanvas(m); };

  const nonInheritanceRelations = metaModel.relations.filter((r) => r.kind !== 'INHERITANCE');

  return (
    <div style={{
      width: 210,
      background: 'var(--iml-sidebar-bg)',
      color: 'var(--iml-sidebar-text)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
	  {/* Conformance badge + popover */}
      <div ref={issueRef} style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px', position: 'relative', flexShrink: 0 }}>
        {(() => {
          const hasIssues = conformanceResults.length > 0 || coEvoWarnings.length > 0;
          const totalCount = conformanceResults.length + coEvoWarnings.length;
          const badge = hasIssues
            ? { bg: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: 'rgba(245,158,11,0.5)' }
            : { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' };
          return (
            <>
              <button
                onClick={() => hasIssues && setIssueOpen((o) => !o)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 20,
                  border: `1px solid ${badge.border}`,
                  background: badge.bg, color: badge.color,
                  fontSize: 12, fontWeight: 700, cursor: hasIssues ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  letterSpacing: '0.03em',
                }}
              >
                {hasIssues
                  ? <><span>⚠ {totalCount} Conformance Issue{totalCount > 1 ? 's' : ''}</span><span style={{ opacity: 0.7, fontSize: 11 }}>›</span></>
                  : <span>✓ Valid Conformance</span>
                }
              </button>

              {issueOpen && hasIssues && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 8, right: 8, zIndex: 300,
                  background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '8px 12px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    Conformance Issues
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', padding: '6px 12px 10px', fontFamily: 'var(--iml-font-mono)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {coEvoWarnings.map((w, i) => (
                      <div key={`ce-${i}`} style={{ color: '#93c5fd' }}>↳ {w}</div>
                    ))}
                    {conformanceResults.map((r, i) => (
                      <div key={i} style={{ color: '#fca5a5' }}>⚠ {r.msg}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
	  
      {/* Mode tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {['metamodel', 'instance'].map((m) => (
          <button key={m} onClick={() => switchMode(m)} style={{
            flex: 1, padding: '10px 4px', fontSize: 11, fontWeight: 600,
            background: mode === m ? 'var(--iml-primary)' : 'transparent',
            color: '#fff', border: 'none', cursor: 'pointer',
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {m === 'metamodel' ? 'Meta-Model' : 'Instance'}
          </button>
        ))}
      </div>
	  
	  

      {/* Model name editor */}
      <div style={{ padding: '8px 8px 2px' }}>
        <div style={{ fontSize: 10, opacity: 0.5, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>
          {mode === 'metamodel' ? 'Meta-Model Name' : 'Instance Model Name'}
        </div>
        <input
          value={mode === 'metamodel' ? metaModel.name : (instanceModel?.name ?? '')}
          onChange={(e) => mode === 'metamodel'
            ? updateMetaModelName(e.target.value)
            : updateInstanceModelName(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4, color: '#f1f5f9',
            padding: '5px 8px', fontSize: 12, fontWeight: 600, outline: 'none',
          }}
        />
      </div>

      {/* Scrollable palette area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
      <SectionLabel>Palette</SectionLabel>

      {mode === 'metamodel' ? (
        <>
          <PaletteBtn label="Class"          color="var(--iml-primary)" onClick={() => handleAddClass(false)} />
          <PaletteBtn label="Abstract Class" color="var(--iml-secondary)" italic onClick={() => handleAddClass(true)} />

          <SectionLabel>Relation Type</SectionLabel>
          {EDGE_TYPES.map((et) => (
            <button key={et} onClick={() => setPendingEdgeType(pendingEdgeType === et ? null : et)} style={{
              margin: '2px 8px', padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
              border: `2px solid ${pendingEdgeType === et ? EDGE_COLORS[et] : 'transparent'}`,
              background: pendingEdgeType === et ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
              color: 'var(--iml-sidebar-text)', fontSize: 12, textAlign: 'left',
			  fontWeight: pendingEdgeType === et ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', borderColor: '#ffffff', borderWidth: 'thin',  background: EDGE_COLORS[et], flexShrink: 0 }} />
              {et.charAt(0) + et.slice(1).toLowerCase()}
            </button>
          ))}
          <div style={{ margin: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            {pendingEdgeType
              ? 'Hover a class — handles appear. Drag to the target class.'
              : 'Select a relation type, then drag between class handles.'}
          </div>
        </>
      ) : (
        <>
          {/* Instance model switcher */}
          <SectionLabel>Instance Models</SectionLabel>
          <div style={{ padding: '0 8px 6px' }}>
            {instanceModels.map((im, idx) => (
              <div key={im.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <button onClick={() => switchInstanceModel(idx)} style={{
                  flex: 1, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${idx === currentIMIndex ? '#888888' : 'transparent'}`,
                  background: idx === currentIMIndex ? 'rgba(136,136,136,0.2)' : 'rgba(255,255,255,0.05)',
                  color: 'var(--iml-sidebar-text)', fontSize: 11, fontWeight: idx === currentIMIndex ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {im.name}
                </button>
                {instanceModels.length > 1 && (
                  <button
                    title="Delete this instance model"
                    onClick={() => ask(
                      `Delete "${instanceModels[idx].name}"? This cannot be undone.`,
                      () => deleteInstanceModel(idx)
                    )}
                    style={{
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                      cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px', flexShrink: 0,
                    }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addInstanceModel} style={{
              width: '100%', marginTop: 2, padding: '5px', borderRadius: 4, cursor: 'pointer',
              border: '1px dashed rgba(255,255,255,0.25)', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', fontSize: 11,
            }}>
              + New instance model
            </button>
          </div>

          <SectionLabel>Add Object</SectionLabel>
          {metaModel.classes.filter((c) => !c.isAbstract).map((cls) => (
            <PaletteBtn key={cls.id} label={cls.name} color="#888888" onClick={() => handleAddObject(cls.id)} />
          ))}
          {metaModel.classes.filter((c) => !c.isAbstract).length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 12, opacity: 0.5, fontStyle: 'italic' }}>
              No concrete classes yet.
            </div>
          )}

          {/* Relation type selector */}
          {nonInheritanceRelations.length > 0 && (
            <>
              <SectionLabel>Relation Type</SectionLabel>
              {nonInheritanceRelations.map((rel) => {
                const srcCls  = metaModel.classes.find((c) => c.id === rel.source);
                const tgtCls  = metaModel.classes.find((c) => c.id === rel.target);
                const isActive = pendingRelationId === rel.id;
                return (
                  <button key={rel.id} onClick={() => setPendingRelationId(isActive ? null : rel.id)} style={{
                    margin: '2px 8px', padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                    border: `2px solid ${isActive ? '#888888' : 'transparent'}`,
                    background: isActive ? 'rgba(136,136,136,0.45)' : 'rgba(255,255,255,0.25)',
                    color: 'var(--iml-sidebar-text)', fontSize: 11, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 1,
                  }}>
                    <span style={{ fontWeight: 600 }}>{rel.name || rel.kind.toLowerCase()}</span>
                    <span style={{ opacity: 0.6, fontSize: 10 }}>
                      {srcCls?.name ?? '?'} → {tgtCls?.name ?? '?'}
                    </span>
                  </button>
                );
              })}
              <div style={{ margin: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                {pendingRelationId
                  ? 'Drag between object handles to draw this relation.'
                  : 'Select a relation type to connect objects.'}
              </div>
            </>
          )}
        </>
      )}

      </div>{/* end scrollable palette area */}

      {/* Clear button */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={() => {
            if (mode === 'metamodel') {
              ask('Clear the entire meta-model and all instance models? This cannot be undone.', clearMetaModel);
            } else {
              ask(`Clear all objects and links in "${instanceModel?.name}"? This cannot be undone.`, clearInstanceModel);
            }
          }}
          style={{
            width: '100%', padding: '6px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.15)',
            color: '#fca5a5', fontSize: 11, fontWeight: 600,
          }}
        >
          {mode === 'metamodel' ? 'Clear Meta-Model…' : 'Clear Instance Model…'}
        </button>
      </div>

      

      <div style={{ padding: '6px 8px', fontSize: 11, opacity: 0.4, textAlign: 'center' }}>
        {mode === 'metamodel' ? 'Del removes selected class / relation' : 'Del removes selected object / link'}
      </div>

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={() => { confirm.onConfirm(); dismiss(); }}
          onCancel={dismiss}
        />
      )}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
    }}
      onClick={onCancel}
    >
      <div style={{
        background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '24px 28px', maxWidth: 340, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        color: '#f1f5f9', fontFamily: 'var(--iml-font-sans)',
      }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)',
            color: '#f1f5f9', fontWeight: 600,
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13,
            border: 'none', background: '#dc2626',
            color: '#fff', fontWeight: 600,
          }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '10px 12px 4px', fontSize: 10, opacity: 0.55, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function PaletteBtn({ label, color, italic, onClick }) {
  return (
    <button onClick={onClick} style={{
      margin: '2px 8px', padding: '8px 10px', borderRadius: 5,
      border: 'none', background: 'rgba(255,255,255,0.25)',
      color: 'var(--iml-sidebar-text)', fontSize: 12, textAlign: 'left',
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
      fontStyle: italic ? 'italic' : 'normal',
    }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.45)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
    >
      <span style={{ width: 12, height: 12, borderRadius: 3, borderColor: '#ffffff', 
	  borderWidth: 'thin', background: color, flexShrink: 0 }} />
      {label}
    </button>
  );
}
