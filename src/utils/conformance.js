// Pure conformance validation: check an instance model against its meta-model.
// Extracted from the store so every rule is unit-testable in isolation.

import { getAllAttributes, getEnum, isEnumValueValid } from './modelHelpers.js';

// ── Inheritance-aware class conformance ──────────────────────────────────────
// True if classId equals expectedId or is a (transitive) subclass of it.
// INHERITANCE relations are stored as source=child, target=parent.
export function isConformantClass(classId, expectedId, relations) {
  if (classId === expectedId) return true;
  const parentRel = relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  if (!parentRel) return false;
  return isConformantClass(parentRel.target, expectedId, relations);
}

// ── Multiplicity parsing / description ───────────────────────────────────────
export function parseMult(mult) {
  if (!mult || !mult.trim()) return null;
  const t = mult.trim();
  if (t === '*') return { lower: 0, upper: Infinity };
  if (!t.includes('..')) {
    const n = parseInt(t, 10);
    return isNaN(n) ? null : { lower: n, upper: n };
  }
  const [lo, hi] = t.split('..');
  const lower = parseInt(lo, 10);
  const upper = hi.trim() === '*' ? Infinity : parseInt(hi, 10);
  return { lower: isNaN(lower) ? 0 : lower, upper: isNaN(upper) ? Infinity : upper };
}

export function multDesc(m) {
  if (m.lower === m.upper) return `exactly ${m.lower}`;
  if (m.upper === Infinity && m.lower === 0) return 'any number of';
  if (m.upper === Infinity) return `at least ${m.lower}`;
  if (m.lower === 0) return `at most ${m.upper}`;
  return `between ${m.lower} and ${m.upper}`;
}

// ── Conformance ──────────────────────────────────────────────────────────────
// Returns an array of { kind, id, msg } errors for `instanceModel` against
// `metaModel`. Meta-model-level rules (single inheritance, unnamed relations)
// are included so the same result can drive the editor badge.
export function validateConformance(metaModel, instanceModel) {
  const errors = [];
  const im = instanceModel ?? { objects: [], links: [] };

  // Meta-model level: single inheritance only
  for (const cls of metaModel.classes) {
    const parentRels = metaModel.relations.filter((r) => r.kind === 'INHERITANCE' && r.source === cls.id);
    if (parentRels.length > 1) {
      errors.push({ kind: 'class', id: cls.id, msg: `Class "${cls.name}" inherits from multiple parents — only single inheritance is supported` });
    }
  }

  // Meta-model level: reference and composition relations must have a name
  for (const rel of metaModel.relations) {
    if (rel.kind === 'INHERITANCE') continue;
    if (!rel.name || !rel.name.trim()) {
      const srcCls = metaModel.classes.find((c) => c.id === rel.source);
      const tgtCls = metaModel.classes.find((c) => c.id === rel.target);
      errors.push({ kind: 'relation', id: rel.id, msg: `${rel.kind.charAt(0) + rel.kind.slice(1).toLowerCase()} from "${srcCls?.name ?? '?'}" to "${tgtCls?.name ?? '?'}" has no name — required for code generation` });
    }
  }

  // Object level: class existence, abstractness, attribute types & multiplicity
  for (const obj of im.objects) {
    const cls = metaModel.classes.find((c) => c.id === obj.classId);
    if (!cls) {
      errors.push({ kind: 'object', id: obj.id, msg: `Object "${obj.name}" references unknown class "${obj.classId}"` });
      continue;
    }
    if (cls.isAbstract) {
      errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}" instantiates abstract class "${cls.name}"` });
    }
    for (const attr of getAllAttributes(obj.classId, metaModel)) {
      if (!obj.attributeValues || !(attr.id in obj.attributeValues)) continue;
      const rawVal  = obj.attributeValues[attr.id];
      const isMulti = Array.isArray(rawVal);

      if (isMulti) {
        const nonEmpty = rawVal.filter((v) => String(v).trim() !== '');
        if (attr.lowerBound > 0 && nonEmpty.length < attr.lowerBound)
          errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" needs at least ${attr.lowerBound} value(s) — found ${nonEmpty.length}` });
        if (attr.upperBound !== -1 && nonEmpty.length > attr.upperBound)
          errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" allows at most ${attr.upperBound} value(s) — found ${nonEmpty.length}` });
        for (const val of nonEmpty) {
          if (attr.type === 'INT'     && !/^-?\d+$/.test(String(val).trim()))
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain integers (got "${val}")` });
          if (attr.type === 'DOUBLE'  && isNaN(Number(val)))
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain numbers (got "${val}")` });
          if (attr.type === 'BOOLEAN' && val !== 'true' && val !== 'false')
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain true/false (got "${val}")` });
          if (attr.type === 'ENUM') {
            const en = getEnum(attr.enumId, metaModel);
            if (!en)
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" references an undefined enumeration` });
            else if (!isEnumValueValid(val, en))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be one of ${en.name} {${en.literals.join(', ')}} (got "${val}")` });
          }
        }
      } else {
        const val = rawVal ?? '';
        if (attr.lowerBound > 0 && val === '') {
          errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": required attribute "${attr.name}" is empty` });
          continue;
        }
        if (val !== '') {
          if (attr.type === 'INT'     && !/^-?\d+$/.test(val.trim()))
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be an integer (got "${val}")` });
          if (attr.type === 'DOUBLE'  && isNaN(Number(val)))
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be a number (got "${val}")` });
          if (attr.type === 'BOOLEAN' && val !== 'true' && val !== 'false')
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be true or false (got "${val}")` });
          if (attr.type === 'ENUM') {
            const en = getEnum(attr.enumId, metaModel);
            if (!en)
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" references an undefined enumeration` });
            else if (!isEnumValueValid(val, en))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be one of ${en.name} {${en.literals.join(', ')}} (got "${val}")` });
          }
        }
      }
    }
  }

  // Link level: endpoints must conform to the relation's declared classes
  for (const lnk of im.links) {
    if (!lnk.relationId) continue;
    const rel = metaModel.relations.find((r) => r.id === lnk.relationId);
    if (!rel) continue;
    const srcObj     = im.objects.find((o) => o.id === lnk.source);
    const tgtObj     = im.objects.find((o) => o.id === lnk.target);
    const relName    = rel.name || rel.kind;
    const srcClsName = metaModel.classes.find((c) => c.id === rel.source)?.name ?? '?';
    const tgtClsName = metaModel.classes.find((c) => c.id === rel.target)?.name ?? '?';
    if (srcObj && !isConformantClass(srcObj.classId, rel.source, metaModel.relations))
      errors.push({ kind: 'link', id: lnk.id, msg: `Relation "${relName}": source "${srcObj.name}" is "${metaModel.classes.find((c) => c.id === srcObj.classId)?.name ?? srcObj.classId}", expected "${srcClsName}" or a subclass` });
    if (tgtObj && !isConformantClass(tgtObj.classId, rel.target, metaModel.relations))
      errors.push({ kind: 'link', id: lnk.id, msg: `Relation "${relName}": target "${tgtObj.name}" is "${metaModel.classes.find((c) => c.id === tgtObj.classId)?.name ?? tgtObj.classId}", expected "${tgtClsName}" or a subclass` });
  }

  // Relation multiplicity: count links per conforming object against the bounds
  for (const rel of metaModel.relations) {
    if (rel.kind === 'INHERITANCE') continue;
    const srcMult = parseMult(rel.sourceMultiplicity);
    const tgtMult = parseMult(rel.targetMultiplicity);
    if (!srcMult && !tgtMult) continue;

    const relName     = rel.name || `(${rel.kind})`;
    const srcClsName  = metaModel.classes.find((c) => c.id === rel.source)?.name ?? '?';
    const tgtClsName  = metaModel.classes.find((c) => c.id === rel.target)?.name ?? '?';
    const linksForRel = im.links.filter((l) => l.relationId === rel.id);

    if (tgtMult) {
      for (const srcObj of im.objects.filter((o) => isConformantClass(o.classId, rel.source, metaModel.relations))) {
        const count = linksForRel.filter((l) => l.source === srcObj.id).length;
        const bad = count < tgtMult.lower || (tgtMult.upper !== Infinity && count > tgtMult.upper);
        if (bad)
          errors.push({ kind: 'object', id: srcObj.id, msg: `"${srcObj.name}" (${srcClsName}): relation "${relName}" needs ${multDesc(tgtMult)} ${tgtClsName} — found ${count}` });
      }
    }
    if (srcMult) {
      for (const tgtObj of im.objects.filter((o) => isConformantClass(o.classId, rel.target, metaModel.relations))) {
        const count = linksForRel.filter((l) => l.target === tgtObj.id).length;
        const bad = count < srcMult.lower || (srcMult.upper !== Infinity && count > srcMult.upper);
        if (bad)
          errors.push({ kind: 'object', id: tgtObj.id, msg: `"${tgtObj.name}" (${tgtClsName}): relation "${relName}" needs ${multDesc(srcMult)} ${srcClsName} — found ${count}` });
      }
    }
  }

  return errors;
}
