import { useState, useEffect } from 'react';
import { useModelStore, getAllAttributes } from '../store/modelStore';

// ── Shared dark-theme tokens ──────────────────────────────────────────────────
const PANEL_BG   = '#0f172a';
const HEADER_BG  = '#1e293b';
const BORDER     = 'rgba(255,255,255,0.1)';
const TEXT       = '#f1f5f9';
const TEXT_MUTED = 'rgba(255,255,255,0.45)';
const INPUT_BG   = 'rgba(255,255,255,0.07)';
const INPUT_BORDER = 'rgba(255,255,255,0.15)';
const CARD_BG    = 'rgba(255,255,255,0.05)';

const panelStyle = {
  width: 260, background: PANEL_BG,
  borderLeft: `1px solid ${BORDER}`,
  display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
  color: TEXT,
};
const headerStyle = {
  padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
  fontWeight: 600, fontSize: 13, color: TEXT, background: HEADER_BG,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexShrink: 0,
};
const inputStyle = {
  border: `1px solid ${INPUT_BORDER}`, borderRadius: 4,
  padding: '6px 10px', fontSize: 13, color: TEXT,
  background: INPUT_BG, outline: 'none',
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--iml-font-sans)',
};
const selectStyle = {
  ...inputStyle, cursor: 'pointer',
};

const labelStyle = {
  fontSize: 11, color: TEXT_MUTED, fontWeight: 600,
  letterSpacing: '0.05em', textTransform: 'uppercase',
};
const sectionStyle = {
  marginBottom: 8, fontWeight: 700, fontSize: 10,
  color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em',
};

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function DeleteBtn({ onClick, label = 'Delete' }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(220,38,38,0.15)', color: '#fca5a5',
      border: '1px solid rgba(220,38,38,0.3)', borderRadius: 4,
      padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    }}>
      {label}
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function PropertiesPanel() {
  const mode           = useModelStore((s) => s.mode);
  const selectedId     = useModelStore((s) => s.selectedId);
  const selectedType   = useModelStore((s) => s.selectedType);
  const metaModel      = useModelStore((s) => s.metaModel);
  const instanceModel  = useModelStore((s) => s.instanceModels[s.currentIMIndex]);
  const conformanceResults = useModelStore((s) => s.conformanceResults);

  const updateClass        = useModelStore((s) => s.updateClass);
  const addClass_attribute = useModelStore((s) => s.addClass_attribute);
  const updateAttribute    = useModelStore((s) => s.updateAttribute);
  const deleteAttribute    = useModelStore((s) => s.deleteAttribute);
  const deleteClass        = useModelStore((s) => s.deleteClass);
  const updateRelation     = useModelStore((s) => s.updateRelation);
  const deleteRelation     = useModelStore((s) => s.deleteRelation);
  const updateObject       = useModelStore((s) => s.updateObject);
  const updateSlot         = useModelStore((s) => s.updateSlot);
  const updateSlotValues   = useModelStore((s) => s.updateSlotValues);
  const deleteObject       = useModelStore((s) => s.deleteObject);

  const cls = (mode === 'metamodel' && selectedType === 'node')
    ? metaModel.classes.find((c) => c.id === selectedId) : null;
  const rel = (mode === 'metamodel' && selectedType === 'edge')
    ? metaModel.relations.find((r) => r.id === selectedId) : null;
  const obj = (mode === 'instance' && selectedType === 'node')
    ? instanceModel?.objects.find((o) => o.id === selectedId) : null;

  // ── Empty state ──────────────────────────────────────────────────────
  if (!selectedId || (!cls && !rel && !obj)) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Properties</div>
        <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic', lineHeight: 1.7 }}>
          {mode === 'metamodel'
            ? 'Click a class or relation to edit its properties.'
            : 'Click an object or link to edit its properties.'}
          <br /><br />
          <span style={{ fontSize: 11 }}>Drag from a handle (●) to connect.</span>
        </div>
      </div>
    );
  }

  // ── Relation ─────────────────────────────────────────────────────────
  if (rel) {
    return (
      <RelationEditor
        key={rel.id}
        rel={rel} metaModel={metaModel}
        updateRelation={updateRelation} deleteRelation={deleteRelation}
      />
    );
  }

  // ── Class node ────────────────────────────────────────────────────────
  if (cls) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>{cls.isAbstract ? '«abstract» ' : ''}{cls.name}</span>
          <DeleteBtn onClick={() => deleteClass(cls.id)} />
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          <Field label="Name">
            <input style={inputStyle} value={cls.name}
              onChange={(e) => updateClass(cls.id, { name: e.target.value })} />
          </Field>
          <Field label="Abstract">
            <select style={selectStyle} value={cls.isAbstract ? 'yes' : 'no'}
              onChange={(e) => updateClass(cls.id, { isAbstract: e.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>

          <div style={sectionStyle}>Attributes</div>
          {cls.attributes.map((attr) => (
            <AttrEditor key={attr.id} classId={cls.id} attr={attr}
              updateAttribute={updateAttribute} deleteAttribute={deleteAttribute} />
          ))}
          <button onClick={() => addClass_attribute(cls.id, {})} style={{
            marginTop: 4, width: '100%', padding: '7px', borderRadius: 5,
            border: `1px dashed ${INPUT_BORDER}`, background: 'transparent',
            color: 'var(--iml-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>
            + Add Attribute
          </button>
        </div>
      </div>
    );
  }

  // ── Object node ───────────────────────────────────────────────────────
  if (obj) {
    const issues  = conformanceResults.filter((r) => r.id === obj.id);
    const objCls  = metaModel.classes.find((c) => c.id === obj.classId);
    const allAttrs = getAllAttributes(obj.classId, metaModel);

    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>{obj.name}</span>
            <span style={{ opacity: 0.6 }}> : {obj.className}</span>
          </span>
          <DeleteBtn onClick={() => deleteObject(obj.id)} />
        </div>
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          <Field label="Name">
            <input style={inputStyle} value={obj.name}
              onChange={(e) => updateObject(obj.id, { name: e.target.value })} />
          </Field>

          {issues.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: 5, padding: '8px 10px', marginBottom: 12, fontSize: 12, color: '#fcd34d',
            }}>
              {issues.map((issue, idx) => <div key={idx}>⚠ {issue.msg}</div>)}
            </div>
          )}

          <div style={sectionStyle}>Attribute Values</div>
          {obj.slots.map((sl) => {
            const attrDef = allAttrs.find((a) => a.id === sl.attrId);
            return (
              <SlotEditor key={sl.attrId} sl={sl} attrDef={attrDef}
                onChange={(v) => updateSlot(obj.id, sl.attrId, v)}
                onChangeValues={(vs) => updateSlotValues(obj.id, sl.attrId, vs)} />
            );
          })}
          {obj.slots.length === 0 && (
            <div style={{ color: TEXT_MUTED, fontSize: 12, fontStyle: 'italic' }}>
              No attributes in meta-model.
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Attribute editor ──────────────────────────────────────────────────────────
function AttrEditor({ classId, attr, updateAttribute, deleteAttribute }) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 6, padding: '10px', marginBottom: 8, border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input style={{ ...inputStyle, flex: 2, padding: '5px 8px', fontSize: 12 }}
          value={attr.name} placeholder="name"
          onChange={(e) => updateAttribute(classId, attr.id, { name: e.target.value })} />
        <select style={{ ...selectStyle, flex: 1.5, padding: '5px 6px', fontSize: 12 }}
          value={attr.type}
          onChange={(e) => updateAttribute(classId, attr.id, { type: e.target.value })}>
          {['STRING', 'INT', 'DOUBLE', 'BOOLEAN'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select style={{ ...selectStyle, flex: 1, padding: '5px 6px', fontSize: 12 }}
          value={attr.visibility}
          onChange={(e) => updateAttribute(classId, attr.id, { visibility: e.target.value })}>
          {['PUBLIC', 'PRIVATE', 'PROTECTED'].map((v) => <option key={v}>{v}</option>)}
        </select>
        <input
          style={{ ...inputStyle, width: 46, textAlign: 'center', padding: '5px 4px', fontSize: 13, fontWeight: 600 }}
          type="number" min="0" max="99"
          value={attr.lowerBound}
          onChange={(e) => updateAttribute(classId, attr.id, { lowerBound: Number(e.target.value) })}
          title="Lower bound"
        />
        <span style={{ color: TEXT_MUTED, fontSize: 13, fontWeight: 700 }}>..</span>
        <input
          style={{ ...inputStyle, width: 46, textAlign: 'center', padding: '5px 4px', fontSize: 13, fontWeight: 600 }}
          value={attr.upperBound === -1 ? '*' : attr.upperBound}
          onChange={(e) => updateAttribute(classId, attr.id, { upperBound: e.target.value === '*' ? -1 : Number(e.target.value) })}
          title="Upper bound — * = many"
        />
        <button onClick={() => deleteAttribute(classId, attr.id)}
          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          title="Delete">×</button>
      </div>
    </div>
  );
}

// ── Slot editor ───────────────────────────────────────────────────────────────
function SlotEditor({ sl, attrDef, onChange, onChangeValues }) {
  const type    = attrDef?.type ?? 'STRING';
  const isMulti = Array.isArray(sl.values);

  const label = (
    <label style={labelStyle}>
      {sl.attrName}
      <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 400, marginLeft: 4, textTransform: 'none' }}>
        ({type.toLowerCase()}{isMulti ? '[]' : ''})
      </span>
    </label>
  );

  if (isMulti) {
    const set = (i, v) => { const next = [...sl.values]; next[i] = v; onChangeValues(next); };
    const add = () => onChangeValues([...sl.values, '']);
    const del = (i) => onChangeValues(sl.values.filter((_, idx) => idx !== i));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {label}
        {sl.values.map((val, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <ValueInput type={type} value={val} onChange={(v) => set(i, v)} />
            <button onClick={() => del(i)}
              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>×</button>
          </div>
        ))}
        <button onClick={add} style={{
          alignSelf: 'flex-start', marginTop: 2, background: 'none',
          border: `1px dashed ${INPUT_BORDER}`, borderRadius: 4,
          color: TEXT_MUTED, fontSize: 11, padding: '3px 8px', cursor: 'pointer',
        }}>
          + add value
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      {label}
      <ValueInput type={type} value={sl.value} onChange={onChange} />
    </div>
  );
}

function ValueInput({ type, value, onChange }) {
  if (type === 'BOOLEAN') {
    return (
      <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (type === 'INT') {
    return <input style={inputStyle} type="number" step="1" placeholder="integer"
      value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (type === 'DOUBLE') {
    return <input style={inputStyle} type="number" step="any" placeholder="decimal"
      value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input style={inputStyle} placeholder="(empty)"
    value={value} onChange={(e) => onChange(e.target.value)} />;
}

// ── Relation editor ───────────────────────────────────────────────────────────
const KIND_COLORS = {
  INHERITANCE: 'var(--iml-inheritance)',
  REFERENCE:   'var(--iml-reference)',
  COMPOSITION: 'var(--iml-composition)',
};

function RelationEditor({ rel, metaModel, updateRelation, deleteRelation }) {
  const color    = KIND_COLORS[rel.kind] ?? TEXT_MUTED;
  const srcClass = metaModel.classes.find((c) => c.id === rel.source);
  const tgtClass = metaModel.classes.find((c) => c.id === rel.target);
  const isInheritance = rel.kind === 'INHERITANCE';

  const [name,    setName]    = useState(rel.name ?? '');
  const [srcMult, setSrcMult] = useState(rel.sourceMultiplicity ?? '');
  const [tgtMult, setTgtMult] = useState(rel.targetMultiplicity ?? '');

  useEffect(() => { setName(rel.name ?? '');                  }, [rel.id]);
  useEffect(() => { setSrcMult(rel.sourceMultiplicity ?? ''); }, [rel.id]);
  useEffect(() => { setTgtMult(rel.targetMultiplicity ?? ''); }, [rel.id]);

  const commit = (patch) => updateRelation(rel.id, patch);

  return (
    <div style={panelStyle}>
      <div style={{ ...headerStyle, borderLeft: `3px solid ${color}` }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '0.06em' }}>{rel.kind}</span>
          <span style={{ fontSize: 12 }}>{srcClass?.name ?? '?'} → {tgtClass?.name ?? '?'}</span>
        </span>
        <DeleteBtn onClick={() => deleteRelation(rel.id)} />
      </div>

      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        <Field label="Kind">
          <select style={selectStyle} value={rel.kind}
            onChange={(e) => commit({ kind: e.target.value })}>
            {['INHERITANCE', 'REFERENCE', 'COMPOSITION'].map((k) => (
              <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </Field>

        {!isInheritance && (
          <>
            <Field label="Relation Name">
              <input style={inputStyle} value={name} placeholder="e.g. owns, uses…"
                onChange={(e) => setName(e.target.value)}
                onBlur={() => commit({ name })} />
            </Field>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Source mult.</label>
                <input style={inputStyle} value={srcMult} placeholder="1"
                  onChange={(e) => setSrcMult(e.target.value)}
                  onBlur={() => commit({ sourceMultiplicity: srcMult })} />
                <span style={{ fontSize: 10, color: TEXT_MUTED }}>{srcClass?.name ?? 'source'}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Target mult.</label>
                <input style={inputStyle} value={tgtMult} placeholder="0..*"
                  onChange={(e) => setTgtMult(e.target.value)}
                  onBlur={() => commit({ targetMultiplicity: tgtMult })} />
                <span style={{ fontSize: 10, color: TEXT_MUTED }}>{tgtClass?.name ?? 'target'}</span>
              </div>
            </div>

            <div style={{
              padding: '8px 10px', background: CARD_BG, borderRadius: 5,
              border: `1px solid ${BORDER}`, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.6,
            }}>
              UML notation:{' '}
              {['1', '0..*', '1..*', '0..1'].map((ex) => (
                <code key={ex} style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 3, marginRight: 4, fontFamily: 'var(--iml-font-mono)' }}>{ex}</code>
              ))}
            </div>
          </>
        )}

        {isInheritance && (
          <div style={{ padding: 10, background: CARD_BG, borderRadius: 5, border: `1px solid ${BORDER}`, fontSize: 12, color: TEXT_MUTED }}>
            Inheritance relations do not carry names or multiplicities.
          </div>
        )}
      </div>
    </div>
  );
}
