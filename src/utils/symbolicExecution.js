import { nanoid } from 'nanoid';
import { getAllAttributes, getEnum } from './modelHelpers.js';
import { safeId, resolveSignalParams } from './javaCodeGen.js';
import { applyActionCode, evaluateCondition, describeUnresolvedGuard } from './actionInterpreter.js';

// Subsumption-based symbolic execution over one capsule class's state
// machine, producing a Symbolic Execution Tree (SET): a node = (FSM state,
// tracked attribute values). A guard that's a simple comparison against a
// KNOWN tracked attribute (same grammar as an action-code if-condition) is
// actually EVALUATED against the node's current values — a guard that's
// definitely true fires deterministically (one edge, no fork); one that's
// definitely false is skipped entirely (no edge, no impossible branch);
// only a guard we genuinely can't evaluate (references an unknown/untracked
// value) falls back to forking both possibilities, same as before. A path
// that reaches a node whose (state, known attribute values) exactly matches
// an already-visited node stops there (subsumption) — this is what makes a
// cyclic machine's exploration terminate. A depth bound is a backstop for
// genuinely-unbounded branches only.
//
// MAX_DEPTH alone only bounds a single PATH's length — it does nothing
// against a machine with several genuinely-unresolvable guard forks (an
// attribute-vs-attribute comparison, a guard on an untracked value, ...)
// chained together: branching factor >=2 at up to 40 steps combines well
// before any one path hits the depth cap, and buildSET runs fully
// synchronously on the main thread, so that's a hung "Building…" spinner
// with no warning and no cancel. MAX_NODES is the matching whole-TREE
// backstop, checked once per node expansion — found during a pre-alpha
// code review, before it had ever actually been hit by a real model.

const MAX_DEPTH = 40;
const MAX_NODES = 4000; // generous for any real teaching model; still finishes in well under a second

// stateId + every KNOWN attribute's id/value, sorted for order-independence.
// Two nodes are equivalent iff this string matches exactly (strict subsumption:
// the same SET of attributes must be known, with the same values, on both).
export function signatureOf(stateId, attrValues) {
  const known = [];
  for (const [attrId, v] of attrValues) {
    if (v.kind === 'known') known.push(`${attrId}=${v.value}`);
  }
  known.sort();
  return `${stateId}|${known.join(',')}`;
}

// Walks a leaf's parentEdgeId chain back to the root and reverses it into a
// root-to-leaf sequence — the SET's own path structure IS the test case /
// the highlightable path, this just reads it back out. Shared by the
// abstract/concrete test generators and the SET Viewer's path highlighting.
export function pathToLeaf(leafId, setResult) {
  const { nodesById, edgesById } = setResult;
  const leaf = nodesById.get(leafId);
  if (!leaf) return null;

  const edgeChain = [];
  let cur = leaf;
  while (cur.parentEdgeId) {
    const edge = edgesById.get(cur.parentEdgeId);
    edgeChain.push(edge);
    cur = nodesById.get(edge.sourceNodeId);
  }
  edgeChain.reverse();
  return { leaf, root: cur, edgeChain };
}

export function buildSET(classId, metaModel) {
  const nodesById = new Map();
  const edgesById = new Map();
  const machine = metaModel.behaviours?.[classId];

  const cls = metaModel.classes.find((c) => c.id === classId);
  const attrs = getAllAttributes(classId, metaModel);
  const attrIndex = new Map(attrs.map((a) => [safeId(a.name), a]));

  const rootValues = new Map();
  for (const a of attrs) {
    rootValues.set(a.id, (a.defaultValue !== undefined && String(a.defaultValue).trim() !== '')
      ? { kind: 'known', value: String(a.defaultValue) }
      : { kind: 'unknown' });
  }

  const initialState  = machine?.states?.find((s) => s.kind === 'initial');
  const initTransition = initialState ? machine.transitions.find((t) => t.source === initialState.id) : null;
  const startTarget    = initTransition ? machine.states.find((s) => s.id === initTransition.target) : null;

  if (!startTarget || startTarget.kind !== 'simple') {
    // No resolvable initial transition — an empty (root-only) tree, mirroring
    // Module 3's own graceful degradation for a malformed/incomplete machine.
    const rootId = nanoid(8);
    nodesById.set(rootId, {
      id: rootId, stateId: null, attrValues: rootValues, depth: 0,
      parentEdgeId: null, status: 'leaf-deadend', subsumedByNodeId: null,
    });
    return { nodesById, edgesById, rootId, classId };
  }

  const visited = new Map(); // signature -> nodeId

  // Trigger "port.signal" -> {kind:'timeout'|'signal', port, signal?, msLabel?}.
  // The duration label is best-effort only (first textual informIn/informEvery
  // call in the source state's entry action) — it never affects a concrete
  // test's correctness, since generated tests just fire "whatever's next due."
  function eventFor(trigger, sourceEntryText) {
    const [portName, signalName] = trigger.split('.');
    const port = (cls?.ports ?? []).find((p) => p.name === portName);
    const isTimeout = port?.protocolId === 'sys-timing' && signalName === 'timeout';
    if (!isTimeout) return { kind: 'signal', port: portName, signal: signalName };
    const m = (sourceEntryText || '').match(new RegExp(`${portName}\\.(informIn|informEvery)\\(([^)]*)\\)`));
    return { kind: 'timeout', port: portName, msLabel: m ? m[2].trim() : null };
  }

  function makeNode(stateId, attrValues, depth, parentEdgeId, status) {
    const id = nanoid(8);
    nodesById.set(id, { id, stateId, attrValues, depth, parentEdgeId, status, subsumedByNodeId: null });
    return id;
  }

  function makeEdge(sourceNodeId, targetNodeId, transitionId, branch, guardFork, event, guardReason, paramLabel) {
    const id = nanoid(8);
    edgesById.set(id, { id, sourceNodeId, targetNodeId, transitionId, branch, guardFork, event, guardReason: guardReason ?? null, paramLabel: paramLabel ?? null });
    return id;
  }

  // Applies one transition (effect, then the target state's entry action) and
  // creates the resulting child node — either a fresh 'open' node (which gets
  // recursively expanded) or a 'leaf-subsumed'/'leaf-final' node.
  //
  // ctxAttrIndex/paramOverrides/paramLabel come from the caller's enum-
  // parameter fork (see enumParamCombos below) — ctxAttrIndex extends the
  // capsule's own attrIndex with a synthetic entry for the signal parameter
  // name so t.effect's action code (e.g. "p1Move = move;") can resolve it
  // via the same resolveValue() path as any other tracked identifier;
  // paramOverrides is the matching known-value entry, merged into the
  // values map ONLY for that one applyActionCode(t.effect, ...) call and
  // then stripped back out — it's a transient dispatch-local, not persistent
  // capsule state, and must never leak into the subsumption signature. It's
  // deliberately NOT carried into the target state's entry() action: real
  // generated Java calls enterX() as a separate method, so the signal
  // parameter's local variable is genuinely out of scope there too — this
  // mirrors that exactly rather than being more capable than the real code.
  function fireTransition(node, t, trigger, branch, guardFork, guardReason, ctxAttrIndex, paramOverrides, paramLabel) {
    const sourceState = machine.states.find((s) => s.id === node.stateId);
    const event = eventFor(trigger, sourceState?.entry);
    const targetState = machine.states.find((s) => s.id === t.target);

    const effectValues = paramOverrides ? new Map([...node.attrValues, ...paramOverrides]) : node.attrValues;
    let childValues = applyActionCode(t.effect, ctxAttrIndex ?? attrIndex, effectValues);
    if (paramOverrides) {
      for (const key of paramOverrides.keys()) childValues.delete(key);
    }

    if (targetState?.kind === 'final') {
      const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'leaf-final');
      const edgeId  = makeEdge(node.id, childId, t.id, branch, guardFork, event, guardReason, paramLabel);
      nodesById.get(childId).parentEdgeId = edgeId;
      return;
    }

    childValues = applyActionCode(targetState.entry, attrIndex, childValues);
    const sig = signatureOf(targetState.id, childValues);
    const existingId = visited.get(sig);

    if (existingId) {
      const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'leaf-subsumed');
      nodesById.get(childId).subsumedByNodeId = existingId;
      const edgeId = makeEdge(node.id, childId, t.id, branch, guardFork, event, guardReason, paramLabel);
      nodesById.get(childId).parentEdgeId = edgeId;
      return;
    }

    const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'open');
    const edgeId  = makeEdge(node.id, childId, t.id, branch, guardFork, event, guardReason, paramLabel);
    const childNode = nodesById.get(childId);
    childNode.parentEdgeId = edgeId;
    visited.set(sig, childId);
    expand(childNode);
  }

  // The "all guards false, signal dropped" outcome: a leaf that subsumes
  // straight back into the source node (nothing changed) — reuses the
  // subsumption machinery instead of special-casing "no-op" edges. guardFork
  // is false when every member's guard was fully evaluated to false (the
  // drop is certain), true when at least one member couldn't be evaluated
  // (the drop is only one of the possible outcomes).
  function fireDropped(node, trigger, guardFork, guardReason, paramLabel) {
    const sourceState = machine.states.find((s) => s.id === node.stateId);
    const event = eventFor(trigger, sourceState?.entry);
    const droppedId = makeNode(node.stateId, node.attrValues, node.depth + 1, null, 'leaf-subsumed');
    nodesById.get(droppedId).subsumedByNodeId = node.id;
    const edgeId = makeEdge(node.id, droppedId, null, 'all-guards-false', guardFork, event, guardReason, paramLabel);
    nodesById.get(droppedId).parentEdgeId = edgeId;
  }

  // One fork per combination of every ENUM-typed parameter on this trigger's
  // signal (realistically always exactly one parameter, but this stays
  // correct if a signal ever declares more than one) — a small, bounded
  // domain the tool actually knows, unlike a STRING/INT parameter's
  // genuinely unbounded runtime value. Returns [null] (a single "no
  // injection" entry) when the signal has no enum parameters at all, so the
  // caller's loop doesn't need a separate code path for that far more common
  // case. Each real combo carries: attrIndexExt (the capsule's attrIndex
  // plus a synthetic entry per parameter name, so action code can resolve
  // it like any other identifier), paramOverrides (the matching known-value
  // entries, keyed by those synthetic ids), and label (for the SET edge —
  // "ROCK", or "ROCK, PAPER" if there were ever two).
  //
  // Memoized per trigger string: this is invariant across every node in the
  // tree (it only depends on triggerVal/cls/metaModel, none of which change
  // during one buildSET call), but `expand()` calls it once per trigger
  // group per node — recomputing it from scratch was cheap per call but
  // measurably added up across a several-thousand-node tree. Safe to share
  // the returned Maps across every node that fires this trigger: everything
  // downstream only ever reads from paramOverrides/attrIndexExt, never
  // mutates them.
  const comboCache = new Map();
  function enumParamCombos(triggerVal) {
    const cached = comboCache.get(triggerVal);
    if (cached) return cached;

    const enumParams = resolveSignalParams(triggerVal, cls, metaModel)
      .map((p) => ({ p, enumDef: p.type === 'ENUM' ? getEnum(p.enumId, metaModel) : null }))
      .filter((x) => x.enumDef && x.enumDef.literals?.length > 0);
    if (enumParams.length === 0) {
      comboCache.set(triggerVal, [null]);
      return [null];
    }

    let combos = [[]];
    for (const { p, enumDef } of enumParams) {
      const next = [];
      for (const combo of combos) {
        for (const literal of enumDef.literals) next.push([...combo, { name: p.name, literal }]);
      }
      combos = next;
    }

    const result = combos.map((entries) => {
      const attrIndexExt = new Map(attrIndex);
      const paramOverrides = new Map();
      const labels = [];
      for (const { name, literal } of entries) {
        const synthId = `__sigparam_${triggerVal}_${name}`;
        attrIndexExt.set(name, { id: synthId, type: 'ENUM' });
        paramOverrides.set(synthId, { kind: 'known', value: literal });
        labels.push(literal);
      }
      return { attrIndexExt, paramOverrides, label: labels.join(', ') };
    });
    comboCache.set(triggerVal, result);
    return result;
  }

  function expand(node) {
    if (node.depth >= MAX_DEPTH) { node.status = 'leaf-depth-bound'; return; }
    // Whole-tree backstop — see the MAX_NODES comment above. Reuses the same
    // 'leaf-depth-bound' status as the per-path cap: from the leaf's own
    // perspective it's the same situation either way (a real, well-defined
    // point that exploration just didn't continue past), so it gets the
    // same assertable-but-disclosed treatment everywhere that status is
    // handled, without needing a second status threaded through the UI/
    // codegen. The user-facing wording says "exploration limit", not
    // "depth limit", so it reads correctly for both reasons.
    if (nodesById.size >= MAX_NODES) { node.status = 'leaf-depth-bound'; return; }

    const outgoing = machine.transitions.filter((t) => t.source === node.stateId && t.trigger && t.trigger.trim());
    if (outgoing.length === 0) { node.status = 'leaf-deadend'; return; }

    node.status = 'open';

    const groups = new Map();
    for (const t of outgoing) {
      if (!groups.has(t.trigger)) groups.set(t.trigger, []);
      groups.get(t.trigger).push(t);
    }

    for (const [trigger, group] of groups) {
      // Every combo below runs the SAME guard-evaluation/firing logic that
      // already existed — the only thing that changes per combo is which
      // attrIndex/values context guards and effects see (plain, or extended
      // with one enum-parameter's value injected as a known identifier).
      for (const combo of enumParamCombos(trigger)) {
        const ctxAttrIndex   = combo ? combo.attrIndexExt : attrIndex;
        const ctxValues       = combo ? new Map([...node.attrValues, ...combo.paramOverrides]) : node.attrValues;
        const paramOverrides = combo ? combo.paramOverrides : null;
        const paramLabel     = combo ? combo.label : null;

        let stopped = false;   // an unconditional or a fully-evaluated-true guard fired for certain — matches dispatch()'s if/else-if: nothing after it can run
        let anyUnknown = false; // at least one member's guard couldn't be evaluated, so "none of them fired" is only a possible outcome, not certain
        let lastUnknownReason = null; // informational only — see describeUnresolvedGuard
        for (let i = 0; i < group.length; i++) {
          const t = group[i];
          const guardText = t.guard && t.guard.trim();
          if (!guardText) {
            fireTransition(node, t, trigger, 'unconditional', false, null, ctxAttrIndex, paramOverrides, paramLabel);
            stopped = true;
            break;
          }
          const evaluated = evaluateCondition(guardText, ctxAttrIndex, ctxValues);
          if (evaluated === true) {
            fireTransition(node, t, trigger, `guard-${i}-true`, false, null, ctxAttrIndex, paramOverrides, paramLabel); // certain, given every earlier member was false
            stopped = true;
            break;
          }
          if (evaluated === false) continue; // certainly does not fire — no edge, no impossible branch
          anyUnknown = true;
          lastUnknownReason = describeUnresolvedGuard(guardText, ctxAttrIndex);
          fireTransition(node, t, trigger, `guard-${i}-true`, true, lastUnknownReason, ctxAttrIndex, paramOverrides, paramLabel); // can't rule in or out — fork, same as before
        }
        if (!stopped) fireDropped(node, trigger, anyUnknown, lastUnknownReason, paramLabel);
      }
    }
  }

  let startValues = applyActionCode(initTransition.effect, attrIndex, rootValues);
  startValues = applyActionCode(startTarget.entry, attrIndex, startValues);

  const rootId = makeNode(startTarget.id, startValues, 0, null, 'open');
  visited.set(signatureOf(startTarget.id, startValues), rootId);
  expand(nodesById.get(rootId));

  return { nodesById, edgesById, rootId, classId };
}
