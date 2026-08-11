import { useState } from 'react';
import { useTransformStore, findEnumMismatch } from '../../store/transformStore';
import { getAllAttributes, getAllRelations } from '../../store/modelStore';
import { useOverlayClose } from '../../utils/useOverlayClose';
import { TEXT, TEXT_DIM } from '../theme';

const BORDER   = 'rgba(255,255,255,0.10)';
const ACCENT   = '#7c3aed';
const HEADER_BG = '#161b22';
const CARD_BG   = '#1c2128';

// Display label for an attribute's type — resolves an enum id to its name.
const typeLabel = (attr, metaModel) => attr.type === 'ENUM'
  ? ((metaModel.enumerations ?? []).find((e) => e.id === attr.enumId)?.name ?? 'ENUM')
  : attr.type;

const SELECT_STYLE = {
  background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 4, padding: '2px 4px', fontSize: 11, cursor: 'pointer',
  fontFamily: 'ui-monospace, Consolas, monospace',
};

const INPUT_STYLE = {
  background: '#21262d', border: `1px solid ${BORDER}`, color: TEXT,
  borderRadius: 4, padding: '2px 6px', fontSize: 11,
  fontFamily: 'ui-monospace, Consolas, monospace',
  outline: 'none',
};

// ── Add Rule Modal ────────────────────────────────────────────────────────────
function AddRuleModal({ source, target, onAdd, onClose }) {
  const srcClasses = source.metaModel.classes;
  const tgtClasses = target.metaModel.classes;
  const [srcId, setSrcId] = useState(srcClasses[0]?.id ?? '');
  const [tgtId, setTgtId] = useState(tgtClasses[0]?.id ?? '');

  const handleAdd = () => {
    if (srcId && tgtId) { onAdd(srcId, tgtId); onClose(); }
  };

  const overlayClose = useOverlayClose(onClose);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      {...overlayClose}
    >
      <div
        style={{ background: '#1c2128', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '24px 28px 20px', width: 420, fontFamily: 'var(--iml-font-sans)', color: TEXT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Add Transformation Rule</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'end', gap: 8, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 5, fontWeight: 600 }}>Source Class</div>
            <select value={srcId} onChange={(e) => setSrcId(e.target.value)} style={{ ...SELECT_STYLE, width: '100%', padding: '5px 6px' }}>
              {srcClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.abstract ? ' (abstract)' : ''}</option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: 'center', fontSize: 18, color: ACCENT, paddingBottom: 6 }}>→</div>
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 5, fontWeight: 600 }}>Target Class</div>
            <select value={tgtId} onChange={(e) => setTgtId(e.target.value)} style={{ ...SELECT_STYLE, width: '100%', padding: '5px 6px' }}>
              {tgtClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.abstract ? ' (abstract)' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 18, lineHeight: 1.5 }}>
          Attributes and relations will be auto-mapped by matching name and type.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT_DIM, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Add Rule
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rule Card ─────────────────────────────────────────────────────────────────
function RuleCard({ rule, source, target }) {
  const { updateAttrMapping, updateRelMapping, deleteRule } = useTransformStore();

  const srcCls  = source.metaModel.classes.find((c) => c.id === rule.sourceClassId);
  const tgtCls  = target.metaModel.classes.find((c) => c.id === rule.targetClassId);
  const srcAttrs = getAllAttributes(rule.sourceClassId, source.metaModel);
  const tgtAttrs = getAllAttributes(rule.targetClassId, target.metaModel);
  const srcRels  = getAllRelations(rule.sourceClassId, source.metaModel);

  const handleTypeChange = (targetAttrId, newType) => {
    updateAttrMapping(rule.id, targetAttrId, {
      type: newType,
      sourceAttrId: null,
      value: null,
      expression: newType === 'expression' ? '' : null,
    });
  };

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(124,58,237,0.10)', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{srcCls?.name ?? rule.sourceClassId}</span>
        <span style={{ color: ACCENT, fontSize: 15 }}>→</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{tgtCls?.name ?? rule.targetClassId}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => deleteRule(rule.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_DIM, fontSize: 17, padding: '0 4px', lineHeight: 1 }}
          title="Delete rule"
        >×</button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {/* Attribute mappings */}
        {tgtAttrs.length > 0 && (
          <div style={{ marginBottom: rule.relationMappings?.length > 0 ? 12 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Attributes
            </div>
            {tgtAttrs.map((ta) => {
              const m = rule.attributeMappings.find((x) => x.targetAttrId === ta.id) ?? { type: 'omit', sourceAttrId: null, value: null };
              const enumMismatch = m.type === 'omit' ? findEnumMismatch(source.metaModel, target.metaModel, srcAttrs, ta) : null;
              return (
                <div key={ta.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: TEXT, minWidth: 130, flexShrink: 0 }}>
                    {ta.name}:{' '}
                    <span style={{ color: '#e3b341' }}>{typeLabel(ta, target.metaModel)}</span>
                  </span>

                  <select
                    value={m.type}
                    onChange={(e) => handleTypeChange(ta.id, e.target.value)}
                    style={{ ...SELECT_STYLE, width: 90 }}
                  >
                    <option value="omit">Omit</option>
                    <option value="direct">Direct</option>
                    <option value="constant">Constant</option>
                    <option value="expression">Expression</option>
                  </select>

                  {m.type === 'direct' && (
                    <select
                      value={m.sourceAttrId ?? ''}
                      onChange={(e) => updateAttrMapping(rule.id, ta.id, { sourceAttrId: e.target.value || null })}
                      style={{ ...SELECT_STYLE, flex: 1, minWidth: 100 }}
                    >
                      <option value="">— choose source attr —</option>
                      {srcAttrs.map((sa) => (
                        <option key={sa.id} value={sa.id}>{sa.name} ({typeLabel(sa, source.metaModel)})</option>
                      ))}
                    </select>
                  )}

                  {m.type === 'constant' && (
                    <input
                      value={m.value ?? ''}
                      onChange={(e) => updateAttrMapping(rule.id, ta.id, { value: e.target.value })}
                      placeholder="constant value"
                      style={{ ...INPUT_STYLE, flex: 1, minWidth: 80 }}
                    />
                  )}

                  {m.type === 'expression' && (
                    <>
                      <input
                        value={m.expression ?? ''}
                        onChange={(e) => updateAttrMapping(rule.id, ta.id, { expression: e.target.value })}
                        placeholder={'{first} + " " + {last}'}
                        style={{ ...INPUT_STYLE, flex: 1, minWidth: 120 }}
                      />
                      <div style={{ flexBasis: '100%', fontSize: 10, color: TEXT_DIM, marginLeft: 136, lineHeight: 1.5 }}>
                        refs: {srcAttrs.map((sa) => `{${sa.name}}`).join(', ') || '—'}
                        {'  ·  '}use <code>+ - * /</code>, comparisons <code>&gt; &lt; &gt;= &lt;= == !=</code>, <code>cond ? a : b</code>, <code>"text"</code>, and functions <code>upper() lower() trim() round() abs() len()</code>
                      </div>
                    </>
                  )}

                  {m.type === 'omit' && ta.lowerBound > 0 && (
                    <div style={{ flexBasis: '100%', fontSize: 10, color: '#e3b341', marginLeft: 136, lineHeight: 1.5 }}>
                      ⚠ &quot;{ta.name}&quot; requires at least {ta.lowerBound} value{ta.lowerBound > 1 ? 's' : ''} — omitting it will produce a non-conforming target object.
                    </div>
                  )}

                  {enumMismatch && (
                    <div style={{ flexBasis: '100%', fontSize: 10, color: '#e3b341', marginLeft: 136, lineHeight: 1.5 }}>
                      ⚠ left unmapped: source has a same-named enum attribute &quot;{enumMismatch.sourceAttr.name}&quot;, but its enum
                      {' '}&quot;{enumMismatch.sourceEnum?.name ?? '?'}&quot; doesn&apos;t match target&apos;s &quot;{enumMismatch.targetEnum?.name ?? '?'}&quot;
                      {' '}(same name + literals required to auto-map) — map manually if the values correspond.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Relation mappings */}
        {rule.relationMappings?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Relations
            </div>
            {rule.relationMappings.map((rm) => {
              const tgtRel    = target.metaModel.relations.find((r) => r.id === rm.targetRelId);
              const tgtTarget = target.metaModel.classes.find((c) => c.id === tgtRel?.target);
              return (
                <div key={rm.targetRelId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: TEXT, minWidth: 130, flexShrink: 0 }}>
                    {tgtRel?.name || '(unnamed)'} →{' '}
                    <span style={{ color: '#79c0ff' }}>{tgtTarget?.name ?? '?'}</span>
                  </span>
                  <select
                    value={rm.sourceRelId ?? ''}
                    onChange={(e) => updateRelMapping(rule.id, rm.targetRelId, { sourceRelId: e.target.value || null })}
                    style={{ ...SELECT_STYLE, flex: 1 }}
                  >
                    <option value="">— none —</option>
                    {srcRels.map((sr) => {
                      const srTarget = source.metaModel.classes.find((c) => c.id === sr.target);
                      return (
                        <option key={sr.id} value={sr.id}>
                          {sr.name || '(unnamed)'} → {srTarget?.name ?? '?'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {tgtAttrs.length === 0 && (!rule.relationMappings || rule.relationMappings.length === 0) && (
          <div style={{ fontSize: 11, color: TEXT_DIM, fontStyle: 'italic' }}>
            No attributes or relations to map.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rule Editor Panel ─────────────────────────────────────────────────────────
export default function RuleEditor() {
  const { source, target, rules, addRule } = useTransformStore();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const canAdd = !!(source && target);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      {/* Header */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', background: HEADER_BG, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Transformation Rules
        </span>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          {rules.length} rule{rules.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rule cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {!canAdd ? (
          <div style={{ textAlign: 'center', color: TEXT_DIM, fontSize: 13, marginTop: 64, lineHeight: 1.9 }}>
            Load a <strong style={{ color: TEXT }}>source</strong> and <strong style={{ color: TEXT }}>target</strong> model<br />
            to define transformation rules.
          </div>
        ) : rules.length === 0 ? (
          <div style={{ textAlign: 'center', color: TEXT_DIM, fontSize: 13, marginTop: 64, lineHeight: 1.9 }}>
            No rules yet.<br />
            Click <strong style={{ color: TEXT }}>+ Add Rule</strong> to map a source class to a target class.
          </div>
        ) : (
          rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} source={source} target={target} />
          ))
        )}
      </div>

      {/* Add Rule footer */}
      {canAdd && (
        <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button
            onClick={() => setAddModalOpen(true)}
            style={{
              width: '100%', padding: '8px', borderRadius: 6,
              background: 'rgba(124,58,237,0.10)',
              border: `1px solid rgba(124,58,237,0.30)`,
              color: '#c4b5fd', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--iml-font-sans)',
            }}
          >
            + Add Rule
          </button>
        </div>
      )}

      {addModalOpen && (
        <AddRuleModal
          source={source}
          target={target}
          onAdd={addRule}
          onClose={() => setAddModalOpen(false)}
        />
      )}
    </div>
  );
}
