// Shared model utilities used by modelStore, runTransform, and javaCodeGen.

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

// Convert a single string value from one IML primitive type to another.
// Empty values stay empty. metaAttr is optional; used as the defaultValue fallback.
export function convertSingle(val, fromType, toType, metaAttr) {
  const s = String(val ?? '').trim();
  if (!s || fromType === toType) return s;
  if (toType === 'STRING') return s;

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
