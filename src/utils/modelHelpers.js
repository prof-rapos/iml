// Shared model utilities used by modelStore, runTransform, and javaCodeGen.

// ── Import shape validation ────────────────────────────────────────────────────
// A syntactically-valid JSON file that's the wrong shape (missing/renamed
// fields, an old/incompatible schema, a completely unrelated file that
// happens to have a top-level "metaModel" key) used to pass straight
// through into the store, then crash somewhere downstream the first time
// something did metaModel.classes.map(...) — with no error boundary
// anywhere in the app, that's a blank white screen. This checks just enough
// structure that every existing consumer's unconditional array/field
// access (getAllAttributes, rebuildCanvas, conformance, codegen, ...) is
// safe, without being so strict that a genuinely valid file from an older
// export gets rejected. Returns null when valid, or a user-facing message
// naming what's wrong.
// `requireInstances`: pass true when the caller specifically needs instance
// data (e.g. Transformations' "Load Source" — a target-only export has no
// instanceModels, and running a transform against it used to fail late with
// a cryptic "Cannot read properties of undefined" instead of a clear message
// at load time).
export function validateModelShape(data, requireInstances = false) {
  if (!data || typeof data !== 'object') return 'Not a valid model file.';
  const mm = data.metaModel;
  if (!mm || typeof mm !== 'object') return 'Missing "metaModel" — this doesn\'t look like an .iml.json file.';
  if (!Array.isArray(mm.classes)) return 'metaModel.classes is missing or not a list.';
  if (!Array.isArray(mm.relations)) return 'metaModel.relations is missing or not a list.';
  for (const cls of mm.classes) {
    if (!cls || typeof cls.id !== 'string') return 'One of the meta-model\'s classes is missing an id.';
    if (!Array.isArray(cls.attributes)) return `Class "${cls.name ?? cls.id}" is missing its attributes list.`;
  }
  for (const rel of mm.relations) {
    if (!rel || typeof rel.source !== 'string' || typeof rel.target !== 'string' || typeof rel.kind !== 'string') {
      return 'One of the meta-model\'s relations is missing a source, target, or kind.';
    }
  }
  if (requireInstances && !Array.isArray(data.instanceModels)) {
    return 'This file has no instance models — it looks like a target-only meta-model export. Load it as Target instead, or use a file that also has instance data.';
  }
  return null;
}

// ── Attribute collection (inheritance-aware) ──────────────────────────────────
// Returns all attributes visible on classId: parent attributes first, then own.
export function getAllAttributes(classId, metaModel) {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const parentRel  = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  const parentAttrs = parentRel ? getAllAttributes(parentRel.target, metaModel) : [];
  const ownIds     = new Set(cls.attributes.map((a) => a.id));
  return [...parentAttrs.filter((a) => !ownIds.has(a.id)), ...cls.attributes];
}

// ── Relation collection (inheritance-aware) ───────────────────────────────────
// Returns all non-inheritance relations sourced from classId: inherited ones
// (from the parent chain) first, then classId's own — mirrors getAllAttributes.
export function getAllRelations(classId, metaModel) {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const parentRel  = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  const parentRels = parentRel ? getAllRelations(parentRel.target, metaModel) : [];
  const ownRels    = metaModel.relations.filter((r) => r.source === classId && r.kind !== 'INHERITANCE');
  return [...parentRels, ...ownRels];
}

// ── Enumerations ──────────────────────────────────────────────────────────────
// An attribute with type 'ENUM' references a meta-model enumeration via enumId.
export function getEnum(enumId, metaModel) {
  return (metaModel.enumerations ?? []).find((e) => e.id === enumId) ?? null;
}

// True when value is one of the enumeration's literals. A missing enum is invalid.
export function isEnumValueValid(value, enumDef) {
  if (!enumDef) return false;
  return (enumDef.literals ?? []).includes(String(value));
}

// ── Attribute type conversion ─────────────────────────────────────────────────
// Fallback default: use metaAttr.defaultValue if set, otherwise the type's zero-value.
export function typeDefault(type, metaAttr) {
  const md = metaAttr?.defaultValue;
  if (md !== undefined && String(md).trim() !== '') return String(md);
  switch (type) {
    case 'INT':     return '0';
    case 'DOUBLE':  return '0';
    case 'BOOLEAN': return 'false';
    default:        return '';
  }
}

// The 3rd tier `typeDefault` doesn't reach: an ENUM attribute with no
// explicit `attr.defaultValue` needs its enum's first literal (a real,
// pickable value), not '' — `typeDefault` alone can't resolve that since it
// has no metaModel to look the enum up in. This is the fallback that should
// seed a brand-new attribute slot (a freshly-added object, or an existing
// object backfilled after a new attribute is added to its class) — without
// it, a required ENUM/INT/DOUBLE/BOOLEAN attribute with no default starts
// out as conformance's "required attribute is empty" error the instant the
// object exists, before the user has done anything wrong.
export function attrDefaultValue(attr, metaModel) {
  if (attr.type === 'ENUM') {
    const hasDef = attr.defaultValue !== undefined && String(attr.defaultValue).trim() !== '';
    if (hasDef) return String(attr.defaultValue);
    return getEnum(attr.enumId, metaModel)?.literals?.[0] ?? '';
  }
  return typeDefault(attr.type, attr);
}

// Convert a single string value from one IML primitive type to another.
// Empty values stay empty. metaAttr is optional; used as the defaultValue fallback.
export function convertSingle(val, fromType, toType, metaAttr) {
  const s = String(val ?? '').trim();
  if (!s || fromType === toType) return s;
  // Enum values are stored as their literal name (a string), so converting to a
  // STRING or an ENUM keeps the value as-is (conformance flags invalid literals).
  if (toType === 'STRING' || toType === 'ENUM') return s;

  if (fromType === 'BOOLEAN') {
    const b = s === 'true';
    if (toType === 'INT' || toType === 'DOUBLE') return b ? '1' : '0';
  }

  if (fromType === 'INT' || fromType === 'DOUBLE') {
    const n = parseFloat(s);
    if (toType === 'BOOLEAN') return (!isNaN(n) && n !== 0) ? 'true' : 'false';
    if (toType === 'INT')     return isNaN(n) ? typeDefault('INT',    metaAttr) : String(Math.trunc(n));
    if (toType === 'DOUBLE')  return isNaN(n) ? typeDefault('DOUBLE', metaAttr) : String(n);
  }

  // fromType === 'STRING'
  if (toType === 'INT')  { const n = parseInt(s, 10);  return isNaN(n) ? typeDefault('INT',    metaAttr) : String(n); }
  if (toType === 'DOUBLE') { const n = parseFloat(s);  return isNaN(n) ? typeDefault('DOUBLE', metaAttr) : String(n); }
  if (toType === 'BOOLEAN') {
    if (s === 'true'  || s === '1') return 'true';
    if (s === 'false' || s === '0') return 'false';
    return typeDefault('BOOLEAN', metaAttr);
  }
  return typeDefault(toType, metaAttr);
}

// Convert a value (string or string[]) between types. Arrays are converted element-wise.
export function convertAttrValue(val, fromType, toType, metaAttr) {
  if (fromType === toType) return val;
  if (Array.isArray(val)) return val.map((v) => convertSingle(v, fromType, toType, metaAttr));
  return convertSingle(val, fromType, toType, metaAttr);
}
