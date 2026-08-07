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

// Coerce a list of already-rendered expression results (one per fan-out
// index, or a single one when nothing was multi-valued) to the target
// attribute's type/multiplicity — the expression-mapping sibling of
// coerceValue above. Each result gets its OWN numeric-vs-string inference
// (evalExpression already renders every result to a string, so unlike
// coerceValue there's no single upstream `srcAttr.type` to coerce from).
function coerceExpressionResults(rawResults, tgtAttr) {
  const converted = rawResults.map((raw) => {
    const fromType = isNumericValue(raw) ? 'DOUBLE' : 'STRING';
    return convertSingle(raw, fromType, tgtAttr?.type ?? 'STRING');
  });
  const tgtMulti = tgtAttr ? tgtAttr.upperBound !== 1 : false;
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

  const layouts  = { mm: mmLayout };
  const warnings = [];

  const targetInstanceModels = source.instanceModels.map((srcIM) => {
    // srcObjId → [{ ruleId, tgtObjId, targetClassId }, ...] — an array because
    // more than one rule can share the same sourceClassId (e.g. splitting one
    // source class into two target classes); every matching rule must run,
    // not just whichever `.find()` happens to hit first.
    const objMap = {};
    const objects = [];
    const links = [];

    // Pass 1: create target objects
    for (const srcObj of srcIM.objects) {
      const matchingRules = rules.filter((r) => r.sourceClassId === srcObj.classId);
      for (const rule of matchingRules) {
        const tgtObjId = nanoid(8);
        (objMap[srcObj.id] ??= []).push({ ruleId: rule.id, tgtObjId, targetClassId: rule.targetClassId });

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
            const tgtAttr = tgtAttrs.find((a) => a.id === m.targetAttrId);
            // A constant is always entered/stored as a plain string — coerce
            // it through the same STRING→target-type path a direct mapping
            // gets, otherwise e.g. a BOOLEAN target keeps the literal "yes".
            attributeValues[m.targetAttrId] = coerceValue(m.value ?? '', { type: 'STRING', upperBound: 1 }, tgtAttr);
          } else if (m.type === 'expression') {
            const tgtAttr = tgtAttrs.find((a) => a.id === m.targetAttrId);
            const exprText = m.expression ?? '';

            // Which source attributes this expression actually references,
            // and which of THOSE are multi-valued — determines whether the
            // expression needs to run once per element (fanning out, like
            // the `direct` mapping's own multi-valued handling above) or
            // once overall, same as before. Without this, a multi-valued
            // ref used to flow into evalExpression as a single space-joined
            // string (see transformExpression.js's resolveRef), so e.g.
            // `{x} * 2` over x=["3","4"] silently coerced to NaN → ''.
            const refNames = [...exprText.matchAll(/\{([^}]+)\}/g)].map((r) => r[1].trim());
            const multiRefs = refNames
              .map((name) => srcAttrs.find((a) => a.name === name))
              .filter((a) => a && a.upperBound !== 1);

            let rawResults;
            if (multiRefs.length === 0) {
              const scope = {};
              for (const sa of srcAttrs) scope[sa.name] = getAttrValue(srcObj, sa.id);
              try {
                rawResults = [evalExpression(exprText, scope)];
              } catch (err) {
                const msg = `Expression "${exprText}" failed for attribute "${tgtAttr?.name ?? m.targetAttrId}" on object "${srcObj.name}": ${err.message}`;
                console.warn(msg);
                warnings.push(msg);
                rawResults = [''];
              }
            } else {
              // Fan out positionally: index i of one referenced multi-valued
              // attribute lines up with index i of another, same assumption
              // the rest of the model already makes for a multi-valued
              // attribute's own values. Mismatched lengths truncate to the
              // shortest (with a warning) rather than throwing.
              const lengths = multiRefs.map((a) => (getAttrValue(srcObj, a.id) || []).length);
              const len = Math.min(...lengths);
              if (new Set(lengths).size > 1) {
                const msg = `Expression "${exprText}" for attribute "${tgtAttr?.name ?? m.targetAttrId}" on object "${srcObj.name}": referenced attributes have mismatched lengths (${lengths.join(', ')}) — truncated to ${len}.`;
                console.warn(msg);
                warnings.push(msg);
              }
              rawResults = [];
              for (let i = 0; i < len; i++) {
                const scope = {};
                for (const sa of srcAttrs) {
                  const val = getAttrValue(srcObj, sa.id);
                  scope[sa.name] = (sa.upperBound !== 1 && Array.isArray(val)) ? val[i] : val;
                }
                try {
                  rawResults.push(evalExpression(exprText, scope));
                } catch (err) {
                  const msg = `Expression "${exprText}" failed for attribute "${tgtAttr?.name ?? m.targetAttrId}" on object "${srcObj.name}" (index ${i}): ${err.message}`;
                  console.warn(msg);
                  warnings.push(msg);
                  rawResults.push('');
                }
              }
            }

            attributeValues[m.targetAttrId] = coerceExpressionResults(rawResults, tgtAttr);
          } else {
            // 'omit' (or any unrecognized mapping type) — still initialize the
            // slot, matching every other object-creation path (addObject,
            // addClass_attribute), so a multi-valued target attribute doesn't
            // end up with a missing key that PropertiesPanel misreads as single-valued.
            const tgtAttr = tgtAttrs.find((a) => a.id === m.targetAttrId);
            attributeValues[m.targetAttrId] = tgtAttr && tgtAttr.upperBound !== 1 ? [] : '';
          }
        }

        objects.push({
          id: tgtObjId,
          classId: rule.targetClassId,
          name: srcObj.name,
          attributeValues,
        });
      }
    }

    // Pass 2: create target links (preserving source/target handles)
    for (const srcLink of srcIM.links) {
      const srcRel = source.metaModel.relations.find((r) => r.id === srcLink.relationId);
      if (!srcRel) continue;

      const { source: rawSrc, target: rawTgt } = linkEndpoints(srcLink);
      const matchingRules = rules.filter((r) => r.sourceClassId === srcRel.source);

      for (const rule of matchingRules) {
        const relMap = rule.relationMappings?.find((m) => m.sourceRelId === srcLink.relationId);
        if (!relMap?.targetRelId) continue;

        // rawSrc's object was necessarily created by exactly this rule
        // (rule.sourceClassId matches its class), but rawTgt's class may
        // itself have several matching rules — pick the target object whose
        // rule produced the class the target relation actually points at.
        const targetRel = target.metaModel.relations.find((r) => r.id === relMap.targetRelId);
        const srcEntry = objMap[rawSrc]?.find((e) => e.ruleId === rule.id);
        const tgtEntry = objMap[rawTgt]?.find((e) => e.targetClassId === targetRel?.target) ?? objMap[rawTgt]?.[0];
        if (!srcEntry || !tgtEntry) continue;

        links.push({
          id: nanoid(8),
          relationId: relMap.targetRelId,
          source: srcEntry.tgtObjId,
          target: tgtEntry.tgtObjId,
          sourceHandle: srcLink.sourceHandle ?? null,
          targetHandle: srcLink.targetHandle ?? null,
        });
      }
    }

    const tgtIM = {
      id: nanoid(8),
      kind: 'instancemodel',
      name: srcIM.name,
      objects,
      links,
    };

    // Build instance layout: map source object positions → target object IDs
    // (every target object spawned from the same source object shares its position)
    const srcImLayout = source.layouts?.[`im-${srcIM.id}`] ?? {};
    const tgtImLayout = {};
    for (const [srcId, entries] of Object.entries(objMap)) {
      if (!srcImLayout[srcId]) continue;
      for (const { tgtObjId } of entries) tgtImLayout[tgtObjId] = srcImLayout[srcId];
    }
    layouts[`im-${tgtIM.id}`] = tgtImLayout;

    return tgtIM;
  });

  return {
    metaModel: target.metaModel,
    instanceModels: targetInstanceModels,
    layouts,
    warnings,
  };
}
