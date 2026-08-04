import { useState } from 'react';
import { useModelStore, getAllAttributes } from '../store/modelStore';
import { BORDER, TEXT, TEXT_MUTED, panelStyle, headerStyle } from './panelShellTokens';
import { DeleteBtn } from './panelShell';
import ConfirmModal from './ConfirmModal';

// ── Local-only tokens (not shared — these three are unique to this panel) ──
const INPUT_BG   = 'rgba(255,255,255,0.07)';
const INPUT_BORDER = 'rgba(255,255,255,0.15)';
const CARD_BG    = 'rgba(255,255,255,0.05)';

const inputStyle = {
  border: `1px solid ${INPUT_BORDER}`, borderRadius: 4,
  padding: '6px 10px', fontSize: 13, color: TEXT,
  background: INPUT_BG, outline: 'none',
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--iml-font-sans)',
};
const selectStyle = {
  ...inputStyle, cursor: 'pointer',
  background: '#1e293b',  // solid so OS dropdown popup renders dark, not white
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
  const updateEnumeration  = useModelStore((s) => s.updateEnumeration);
  const deleteEnumeration  = useModelStore((s) => s.deleteEnumeration);
  const addEnumLiteral     = useModelStore((s) => s.addEnumLiteral);
  const updateEnumLiteral  = useModelStore((s) => s.updateEnumLiteral);
  const deleteEnumLiteral  = useModelStore((s) => s.deleteEnumLiteral);

  const cls = (mode === 'metamodel' && selectedType === 'node')
    ? metaModel.classes.find((c) => c.id === selectedId) : null;
  const en = (mode === 'metamodel' && selectedType === 'node')
    ? metaModel.enumerations?.find((e) => e.id === selectedId) : null;
  const rel = (mode === 'metamodel' && selectedType === 'edge')
    ? metaModel.relations.find((r) => r.id === selectedId) : null;
  const obj = (mode === 'instance' && selectedType === 'node')
    ? instanceModel?.objects.find((o) => o.id === selectedId) : null;

  // ── Empty state ──────────────────────────────────────────────────────
  if (!selectedId || (!cls && !rel && !obj && !en)) {
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

  // ── Enumeration node ─────────────────────────────────────────────────
  if (en) {
    return (
      <EnumEditor
        key={en.id}
        en={en}
        updateEnumeration={updateEnumeration}
        deleteEnumeration={deleteEnumeration}
        addEnumLiteral={addEnumLiteral}
        updateEnumLiteral={updateEnumLiteral}
        deleteEnumLiteral={deleteEnumLiteral}
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
              enumerations={metaModel.enumerations ?? []}
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
            <span style={{ opacity: 0.6 }}> : {objCls?.name ?? obj.classId}</span>
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
          {allAttrs.map((attr) => {
            const enumDef = attr.type === 'ENUM'
              ? (metaModel.enumerations?.find((e) => e.id === attr.enumId) ?? null)
              : null;
            return (
              <SlotEditor key={attr.id} attr={attr}
                enumLiterals={enumDef ? enumDef.literals : null}
                enumName={enumDef ? enumDef.name : null}
                value={obj.attributeValues?.[attr.id] ?? (attr.upperBound !== 1 ? [] : '')}
                onChange={(v) => updateSlot(obj.id, attr.id, v)}
                onChangeValues={(vs) => updateSlotValues(obj.id, attr.id, vs)} />
            );
          })}
          {allAttrs.length === 0 && (
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
function AttrEditor({ classId, attr, enumerations = [], updateAttribute, deleteAttribute }) {
  const isSingle = attr.upperBound === 1;
  const enumDef  = attr.type === 'ENUM' ? enumerations.find((e) => e.id === attr.enumId) : null;
  const [pendingNarrow, setPendingNarrow] = useState(null); // { n } while confirming

  // Selecting a primitive sets { type }; selecting an enum sets { type:'ENUM', enumId }.
  const onTypeChange = (raw) => {
    if (raw.startsWith('enum:')) {
      updateAttribute(classId, attr.id, { type: 'ENUM', enumId: raw.slice(5) });
    } else {
      updateAttribute(classId, attr.id, { type: raw, enumId: undefined });
    }
  };
  const typeValue = attr.type === 'ENUM' ? `enum:${attr.enumId}` : attr.type;

  // Narrowing multi- to single-valued keeps only the first array element on
  // every affected object across every instance model — silently, with no
  // undo. Confirm first if there's actually anything to lose.
  const applyUpperBound = (n) => {
    if (n === 1 && attr.upperBound !== 1 && useModelStore.getState().wouldNarrowingLoseData(classId, attr.id)) {
      setPendingNarrow({ n });
      return;
    }
    updateAttribute(classId, attr.id, { upperBound: n });
  };

  return (
    <div style={{ background: CARD_BG, borderRadius: 6, padding: '10px', marginBottom: 8, border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input style={{ ...inputStyle, flex: 2, padding: '5px 8px', fontSize: 12 }}
          value={attr.name} placeholder="name"
          onChange={(e) => updateAttribute(classId, attr.id, { name: e.target.value })} />
        <select style={{ ...selectStyle, flex: 1.5, padding: '5px 6px', fontSize: 12 }}
          value={typeValue}
          onChange={(e) => onTypeChange(e.target.value)}>
          {['STRING', 'INT', 'DOUBLE', 'BOOLEAN'].map((t) => <option key={t} value={t}>{t}</option>)}
          {enumerations.length > 0 && (
            <optgroup label="Enumerations">
              {enumerations.map((e) => <option key={e.id} value={`enum:${e.id}`}>{e.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: isSingle ? 6 : 0 }}>
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
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '*') { updateAttribute(classId, attr.id, { upperBound: -1 }); return; }
            // Ignore non-numeric input rather than committing NaN — conformance's
            // `count > upperBound` check silently treats NaN as "no limit".
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 1) applyUpperBound(n);
          }}
          title="Upper bound — * = many"
        />
        <button onClick={() => deleteAttribute(classId, attr.id)}
          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          title="Delete">×</button>
      </div>
      {isSingle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Default</span>
          <div style={{ flex: 1 }}><DefaultInput attr={attr} classId={classId} enumDef={enumDef} updateAttribute={updateAttribute} /></div>
        </div>
      )}
      {pendingNarrow && (
        <ConfirmModal
          message={`"${attr.name}" holds more than one value on some objects. Narrowing it to a single value will keep only the first and permanently discard the rest — this cannot be undone. Continue?`}
          confirmLabel="Discard extra values"
          onConfirm={() => { updateAttribute(classId, attr.id, { upperBound: pendingNarrow.n }); setPendingNarrow(null); }}
          onCancel={() => setPendingNarrow(null)}
        />
      )}
    </div>
  );
}

function DefaultInput({ attr, classId, enumDef, updateAttribute }) {
  if (attr.type === 'BOOLEAN') {
    return (
      <select style={{ ...selectStyle, padding: '5px 6px', fontSize: 12 }}
        value={attr.defaultValue ?? ''}
        onChange={(e) => updateAttribute(classId, attr.id, { defaultValue: e.target.value })}>
        <option value="">— none —</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (attr.type === 'ENUM') {
    return (
      <select style={{ ...selectStyle, padding: '5px 6px', fontSize: 12 }}
        value={attr.defaultValue ?? ''}
        onChange={(e) => updateAttribute(classId, attr.id, { defaultValue: e.target.value })}>
        <option value="">— none —</option>
        {(enumDef?.literals ?? []).map((lit) => <option key={lit} value={lit}>{lit}</option>)}
      </select>
    );
  }
  return (
    <input
      style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
      type={attr.type === 'INT' || attr.type === 'DOUBLE' ? 'number' : 'text'}
      step={attr.type === 'DOUBLE' ? 'any' : undefined}
      value={attr.defaultValue ?? ''}
      placeholder="none"
      onChange={(e) => updateAttribute(classId, attr.id, { defaultValue: e.target.value })}
    />
  );
}

// ── Slot editor ───────────────────────────────────────────────────────────────
function SlotEditor({ attr, value, onChange, onChangeValues, enumLiterals = null, enumName = null }) {
  const type    = attr?.type ?? 'STRING';
  const isMulti = Array.isArray(value);
  const typeText = enumName ?? type.toLowerCase();

  const label = (
    <label style={labelStyle}>
      {attr?.name}
      <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 400, marginLeft: 4, textTransform: 'none' }}>
        ({typeText}{isMulti ? '[]' : ''})
      </span>
    </label>
  );

  if (isMulti) {
    const setVal = (i, v) => { const next = [...value]; next[i] = v; onChangeValues(next); };
    const add    = () => onChangeValues([...value, '']);
    const del    = (i) => onChangeValues(value.filter((_, idx) => idx !== i));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {label}
        {value.map((val, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <ValueInput type={type} enumLiterals={enumLiterals} value={val} onChange={(v) => setVal(i, v)} />
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
      <ValueInput type={type} enumLiterals={enumLiterals} value={value} onChange={onChange} />
    </div>
  );
}

function ValueInput({ type, value, onChange, enumLiterals = null }) {
  if (enumLiterals) {
    return (
      <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select —</option>
        {enumLiterals.map((lit) => <option key={lit} value={lit}>{lit}</option>)}
      </select>
    );
  }
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

// ── Enumeration editor ────────────────────────────────────────────────────────
function EnumEditor({ en, updateEnumeration, deleteEnumeration, addEnumLiteral, updateEnumLiteral, deleteEnumLiteral }) {
  const addLit = () => {
    let name = 'LITERAL';
    let n = 1;
    while (en.literals.includes(name)) name = `LITERAL${++n}`;
    addEnumLiteral(en.id, name);
  };

  return (
    <div style={panelStyle}>
      <div style={{ ...headerStyle, background: 'var(--iml-tertiary)' }}>
        <span><span style={{ opacity: 0.8, fontStyle: 'italic' }}>«enumeration» </span>{en.name}</span>
        <DeleteBtn onClick={() => deleteEnumeration(en.id)} />
      </div>
      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        <Field label="Name">
          <input style={inputStyle} value={en.name}
            onChange={(e) => updateEnumeration(en.id, { name: e.target.value })} />
        </Field>

        <div style={sectionStyle}>Literals</div>
        {en.literals.length === 0 && (
          <div style={{ color: TEXT_MUTED, fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>
            No literals yet.
          </div>
        )}
        {en.literals.map((lit, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
            <input style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
              value={lit}
              onChange={(e) => updateEnumLiteral(en.id, i, e.target.value)} />
            <button onClick={() => deleteEnumLiteral(en.id, i)}
              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
              title="Delete literal">×</button>
          </div>
        ))}
        <button onClick={addLit} style={{
          marginTop: 4, width: '100%', padding: '7px', borderRadius: 5,
          border: `1px dashed ${INPUT_BORDER}`, background: 'transparent',
          color: 'var(--iml-tertiary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>
          + Add Literal
        </button>
      </div>
    </div>
  );
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

  // The caller mounts this with key={rel.id}, so React already remounts (and
  // re-initializes this state) whenever the selected relation changes — no
  // effect needed to keep these in sync.
  const [name,    setName]    = useState(rel.name ?? '');
  const [srcMult, setSrcMult] = useState(rel.sourceMultiplicity ?? '');
  const [tgtMult, setTgtMult] = useState(rel.targetMultiplicity ?? '');

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
