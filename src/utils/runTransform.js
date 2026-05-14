import { nanoid } from 'nanoid';

// ── Attribute lookup (inheritance-aware) ──────────────────────────────────────
function getAllAttributes(classId, metaModel) {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const parentRel = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  const parentAttrs = parentRel ? getAllAttributes(parentRel.target, metaModel) : [];
  const ownIds = new Set(cls.attributes.map((a) => a.id));
  return [...parentAttrs.filter((a) => !ownIds.has(a.id)), ...cls.attributes];
}

// ── Type conversion ───────────────────────────────────────────────────────────
function typeDefault(type) {
  switch (type) {
    case 'INT':     return '0';
    case 'DOUBLE':  return '0';
    case 'BOOLEAN': return 'false';
    default:        return '';
  }
}

function convertSingle(val, fromType, toType) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (fromType === toType) return s;
  if (toType === 'STRING') return s;

  if (fromType === 'BOOLEAN') {
    const b = s === 'true';
    if (toType === 'INT')    return b ? '1' : '0';
    if (toType === 'DOUBLE') return b ? '1' : '0';
  }

  if (fromType === 'INT' || fromType === 'DOUBLE') {
    const n = parseFloat(s);
    if (toType === 'BOOLEAN') return (!isNaN(n) && n !== 0) ? 'true' : 'false';
    if (toType === 'INT')     return isNaN(n) ? typeDefault('INT')    : String(Math.trunc(n));
    if (toType === 'DOUBLE')  return isNaN(n) ? typeDefault('DOUBLE') : String(n);
  }

  // fromType === 'STRING'
  if (toType === 'INT')  { const n = parseInt(s, 10);  return isNaN(n) ? typeDefault('INT')    : String(n); }
  if (toType === 'DOUBLE') { const n = parseFloat(s);  return isNaN(n) ? typeDefault('DOUBLE') : String(n); }
  if (toType === 'BOOLEAN') {
    if (s === 'true'  || s === '1') return 'true';
    if (s === 'false' || s === '0') return 'false';
    return typeDefault('BOOLEAN');
  }
  return typeDefault(toType);
}

// Coerce a source value to the target attribute's type and multiplicity.
// multi→single: convert each item, take the first.
// single→multi: convert and wrap in array.
// multi→multi:  convert each item.
function coerceValue(srcVal, srcAttr, tgtAttr) {
  const fromType = srcAttr?.type ?? 'STRING';
  const toType   = tgtAttr?.type ?? 'STRING';
  const tgtMulti = tgtAttr ? tgtAttr.upperBound !== 1 : false;

  const vals      = Array.isArray(srcVal) ? srcVal : [srcVal];
  const converted = vals.map((v) => convertSingle(v, fromType, toType));

  return tgtMulti ? converted : (converted[0] ?? '');
}

// ── Value readers ─────────────────────────────────────────────────────────────
// Read an attribute value from either format:
//   current: attributeValues: { [attrId]: value | value[] }
//   legacy:  slots: [{ attrId, value?, values? }]
function getAttrValue(srcObj, attrId) {
  if (srcObj.attributeValues && attrId in srcObj.attributeValues) {
    return srcObj.attributeValues[attrId] ?? '';
  }
  if (Array.isArray(srcObj.slots)) {
    const slot = srcObj.slots.find((s) => s.attrId === attrId);
    if (slot) {
      if (slot.value  !== undefined) return slot.value;
      if (Array.isArray(slot.values)) return slot.values;   // return full array
    }
  }
  return '';
}

// Read link endpoints from either format.
function linkEndpoints(link) {
  return {
    source: link.source ?? link.sourceId,
    target: link.target ?? link.targetId,
  };
}

export function runTransform(source, target, rules) {
  // Build meta-model layout: map source class positions → target class IDs via rules
  const mmLayout = {};
  for (const rule of rules) {
    const srcPos = source.layouts?.mm?.[rule.sourceClassId];
    if (srcPos) mmLayout[rule.targetClassId] = srcPos;
  }

  const layouts = { mm: mmLayout };

  const targetInstanceModels = source.instanceModels.map((srcIM) => {
    const objMap = {};  // srcObjId → tgtObjId
    const objects = [];
    const links = [];

    // Pass 1: create target objects
    for (const srcObj of srcIM.objects) {
      const rule = rules.find((r) => r.sourceClassId === srcObj.classId);
      if (!rule) continue;

      const tgtObjId = nanoid(8);
      objMap[srcObj.id] = tgtObjId;

      // Precompute attr lists for this rule (inheritance-aware, from the correct metaModel)
      const srcAttrs = getAllAttributes(rule.sourceClassId, source.metaModel);
      const tgtAttrs = getAllAttributes(rule.targetClassId, target.metaModel);

      const attributeValues = {};
      for (const m of rule.attributeMappings) {
        if (m.type === 'direct' && m.sourceAttrId) {
          const srcAttr = srcAttrs.find((a) => a.id === m.sourceAttrId);
          const tgtAttr = tgtAttrs.find((a) => a.id === m.targetAttrId);
          const rawVal  = getAttrValue(srcObj, m.sourceAttrId);
          attributeValues[m.targetAttrId] = coerceValue(rawVal, srcAttr, tgtAttr);
        } else if (m.type === 'constant') {
          const tgtAttr  = tgtAttrs.find((a) => a.id === m.targetAttrId);
          const tgtMulti = tgtAttr ? tgtAttr.upperBound !== 1 : false;
          attributeValues[m.targetAttrId] = tgtMulti ? [m.value ?? ''] : (m.value ?? '');
        }
      }

      objects.push({
        id: tgtObjId,
        classId: rule.targetClassId,
        name: srcObj.name,
        attributeValues,
      });
    }

    // Pass 2: create target links (preserving source/target handles)
    for (const srcLink of srcIM.links) {
      const srcRel = source.metaModel.relations.find((r) => r.id === srcLink.relationId);
      if (!srcRel) continue;

      const rule = rules.find((r) => r.sourceClassId === srcRel.source);
      if (!rule) continue;

      const relMap = rule.relationMappings?.find((m) => m.sourceRelId === srcLink.relationId);
      if (!relMap?.targetRelId) continue;

      const { source: rawSrc, target: rawTgt } = linkEndpoints(srcLink);
      const tgtSrc = objMap[rawSrc];
      const tgtTgt = objMap[rawTgt];
      if (!tgtSrc || !tgtTgt) continue;

      links.push({
        id: nanoid(8),
        relationId: relMap.targetRelId,
        source: tgtSrc,
        target: tgtTgt,
        sourceHandle: srcLink.sourceHandle ?? null,
        targetHandle: srcLink.targetHandle ?? null,
      });
    }

    const tgtIM = {
      id: nanoid(8),
      kind: 'instancemodel',
      name: srcIM.name,
      objects,
      links,
    };

    // Build instance layout: map source object positions → target object IDs
    const srcImLayout = source.layouts?.[`im-${srcIM.id}`] ?? {};
    const tgtImLayout = {};
    for (const [srcId, tgtId] of Object.entries(objMap)) {
      if (srcImLayout[srcId]) tgtImLayout[tgtId] = srcImLayout[srcId];
    }
    layouts[`im-${tgtIM.id}`] = tgtImLayout;

    return tgtIM;
  });

  return {
    metaModel: target.metaModel,
    instanceModels: targetInstanceModels,
    layouts,
  };
}
