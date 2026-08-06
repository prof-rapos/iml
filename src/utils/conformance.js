// Pure conformance validation: check an instance model against its meta-model.
// Extracted from the store so every rule is unit-testable in isolation.

import { getAllAttributes, getEnum, isEnumValueValid } from './modelHelpers.js';
// getProtocolById also resolves the built-in Timing/Log system protocols
// (not just metaModel.protocols) — needed so a transition triggered by
// timer.timeout doesn't get flagged as unresolvable. modelStore.js imports
// validateConformance from this file too, so this is a circular import —
// safe here because both sides only reference the other's export from
// inside a function body (called well after both modules have finished
// loading), never at module top level.
import { getProtocolById } from '../store/modelStore.js';

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

  // Meta-model level: behavioural — each of these produces Java that fails
  // to compile with no earlier warning otherwise, since nothing validated
  // state-machine content before this. Both checks are pure metaModel
  // concerns (not instance-model-dependent), so they run every time,
  // mirroring the single-inheritance/unnamed-relation checks above.
  for (const cls of metaModel.classes) {
    const machine = metaModel.behaviours?.[cls.id];
    if (!machine) continue;

    // Two states with the same name (or the initial/entry transition into
    // one of them being ambiguous) become a duplicate Java enum constant —
    // only 'simple' states have a modeled name (Initial/Final don't).
    const seenNames = new Map(); // trimmed name -> first state's id
    for (const st of machine.states) {
      if (st.kind !== 'simple') continue;
      const name = (st.name ?? '').trim();
      if (!name) continue; // caught implicitly — an unnamed simple state still sanitizes to *something*, but that's a separate, pre-existing concern
      if (seenNames.has(name)) {
        errors.push({ kind: 'state', id: st.id, msg: `"${cls.name}": two states are both named "${name}" — would generate a duplicate Java enum constant` });
      } else {
        seenNames.set(name, st.id);
      }
    }

    // A transition's trigger is a frozen "port.signal" string, independent
    // of whatever the port/signal are named NOW — renaming or deleting
    // either doesn't cascade-update it, so it can silently go stale.
    const validTriggers = new Set();
    for (const port of cls.ports ?? []) {
      const proto = getProtocolById(port.protocolId, metaModel);
      if (!proto) continue;
      const wanted = port.conjugated ? 'out' : 'in';
      for (const sig of proto.signals ?? []) {
        if (sig.direction === wanted) validTriggers.add(`${port.name}.${sig.name}`);
      }
    }
    for (const t of machine.transitions ?? []) {
      if (!t.trigger || !t.trigger.trim()) continue; // untriggered (e.g. the initial transition) — nothing to resolve
      if (!validTriggers.has(t.trigger)) {
        const srcState = machine.states.find((s) => s.id === t.source);
        errors.push({
          kind: 'transition', id: t.id,
          msg: `"${cls.name}": a transition from "${srcState?.name || '(unnamed)'}" has trigger "${t.trigger}", which doesn't match any current port/signal — likely stale after a rename or delete`,
        });
      }
    }

    // A transition's trigger is the only port/signal reference validated
    // above — but action code (state entry/exit, transition effect) can
    // just as easily call a port send directly, e.g. `oppositeOut.safe();`,
    // and that reference goes stale exactly the same way on a port/signal
    // rename with nothing catching it before codegen emits it verbatim into
    // Java that then fails to compile. Only meaningful for a class that has
    // ports at all — a portless class's action code has no port vocabulary
    // to check against, so nothing here would be a port-send in the first
    // place.
    if ((cls.ports ?? []).length > 0) {
      const sendableSignals = new Map(); // port name -> Set(signal names sendable through it)
      for (const port of cls.ports) {
        const proto = getProtocolById(port.protocolId, metaModel);
        if (!proto) continue;
        // Opposite of the trigger-side "wanted" direction above: a signal
        // this capsule *sends* through the port, not one it receives.
        const sentDir = port.conjugated ? 'in' : 'out';
        sendableSignals.set(port.name, new Set((proto.signals ?? []).filter((sg) => sg.direction === sentDir).map((sg) => sg.name)));
      }
      // Action code can also call an ordinary Java method on an attribute's
      // value — e.g. `p1Move.equals("R")` on a STRING attribute, the normal
      // (only, for strings) way to compare it — which has the exact same
      // "ident.ident(" shape as a port send. Any identifier that's a real
      // attribute on this class is unambiguous: it's not a port reference,
      // full stop, regardless of what method is being called on it.
      const attrNames = new Set(getAllAttributes(cls.id, metaModel).map((a) => a.name));

      // Regex-based, not a parser — same tradeoff as findMainClasses/
      // stripComments elsewhere. Strip quoted strings first so a log
      // message like `log.log("call foo.bar()")` doesn't spuriously match
      // on its own text content.
      const CALL_RE = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
      const stripStrings = (s) => s.replace(/"(?:[^"\\]|\\.)*"/g, '""');

      const checkActionCode = (text, kind, id, label) => {
        if (!text) return;
        for (const m of stripStrings(text).matchAll(CALL_RE)) {
          const [, portRef, sigRef] = m;
          if (attrNames.has(portRef)) continue;
          const validSigs = sendableSignals.get(portRef);
          if (!validSigs) {
            errors.push({ kind, id, msg: `"${cls.name}": ${label} sends through "${portRef}", which isn't a port on this class — likely stale after a rename or delete` });
          } else if (!validSigs.has(sigRef)) {
            errors.push({ kind, id, msg: `"${cls.name}": ${label} calls "${portRef}.${sigRef}(...)", which isn't a signal "${portRef}" can currently send — likely stale after a rename` });
          }
        }
      };

      for (const st of machine.states ?? []) {
        checkActionCode(st.entry, 'state', st.id, `"${st.name || '(unnamed)'}"'s entry action`);
        checkActionCode(st.exit, 'state', st.id, `"${st.name || '(unnamed)'}"'s exit action`);
      }
      for (const t of machine.transitions ?? []) {
        checkActionCode(t.effect, 'transition', t.id, 'a transition effect');
      }
    }

    // A machine with no (or a duplicate) outgoing transition from its initial
    // pseudostate used to fail silently at runtime instead of at generation
    // time: generateStart() finds nothing (or just the first match) to enter,
    // so currentState stays null forever and dispatch() drops every message
    // with no error anywhere.
    if (machine.states.length > 0) {
      const initialStates = machine.states.filter((s) => s.kind === 'initial');
      if (initialStates.length === 0) {
        errors.push({ kind: 'class', id: cls.id, msg: `"${cls.name}": this state machine has no initial pseudostate — it will never start (dispatch would silently drop every message)` });
      }
      for (const initSt of initialStates) {
        const outgoing = (machine.transitions ?? []).filter((t) => t.source === initSt.id);
        if (outgoing.length === 0) {
          errors.push({ kind: 'state', id: initSt.id, msg: `"${cls.name}": the initial pseudostate has no outgoing transition — the machine will never start (dispatch would silently drop every message)` });
        } else if (outgoing.length > 1) {
          errors.push({ kind: 'state', id: initSt.id, msg: `"${cls.name}": the initial pseudostate has more than one outgoing transition — only one runs, which one is ambiguous` });
        }
      }
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

    // Count links per endpoint once per relation instead of re-filtering
    // linksForRel for every object — O(objects + links) instead of O(objects × links).
    if (tgtMult) {
      const countBySource = new Map();
      for (const l of linksForRel) countBySource.set(l.source, (countBySource.get(l.source) ?? 0) + 1);
      for (const srcObj of im.objects.filter((o) => isConformantClass(o.classId, rel.source, metaModel.relations))) {
        const count = countBySource.get(srcObj.id) ?? 0;
        const bad = count < tgtMult.lower || (tgtMult.upper !== Infinity && count > tgtMult.upper);
        if (bad)
          errors.push({ kind: 'object', id: srcObj.id, msg: `"${srcObj.name}" (${srcClsName}): relation "${relName}" needs ${multDesc(tgtMult)} ${tgtClsName} — found ${count}` });
      }
    }
    if (srcMult) {
      const countByTarget = new Map();
      for (const l of linksForRel) countByTarget.set(l.target, (countByTarget.get(l.target) ?? 0) + 1);
      for (const tgtObj of im.objects.filter((o) => isConformantClass(o.classId, rel.target, metaModel.relations))) {
        const count = countByTarget.get(tgtObj.id) ?? 0;
        const bad = count < srcMult.lower || (srcMult.upper !== Infinity && count > srcMult.upper);
        if (bad)
          errors.push({ kind: 'object', id: tgtObj.id, msg: `"${tgtObj.name}" (${tgtClsName}): relation "${relName}" needs ${multDesc(srcMult)} ${srcClsName} — found ${count}` });
      }
    }
  }

  return errors;
}
