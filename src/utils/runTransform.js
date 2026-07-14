import { nanoid } from 'nanoid';
import { getAllAttributes, convertSingle } from './modelHelpers.js';
import { evalExpression, isNumericValue } from './transformExpression.js';

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
        } else if (m.type === 'expression') {
          const tgtAttr = tgtAttrs.find((a) => a.id === m.targetAttrId);
          // Scope: source attribute name → value (so expressions read {attrName}).
          const scope = {};
          for (const sa of srcAttrs) scope[sa.name] = getAttrValue(srcObj, sa.id);
          let raw;
          try { raw = evalExpression(m.expression ?? '', scope); } catch { raw = ''; }
          // Treat a numeric result as DOUBLE so the target type coercion (e.g.
          // truncation to INT) applies; otherwise treat it as a plain string.
          const fromType = isNumericValue(raw) ? 'DOUBLE' : 'STRING';
          attributeValues[m.targetAttrId] = coerceValue(raw, { type: fromType, upperBound: 1 }, tgtAttr);
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
