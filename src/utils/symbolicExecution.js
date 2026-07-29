import { nanoid } from 'nanoid';
import { getAllAttributes } from './modelHelpers.js';
import { safeId } from './javaCodeGen.js';
import { applyActionCode } from './actionInterpreter.js';

// Subsumption-based symbolic execution over one capsule class's state
// machine, producing a Symbolic Execution Tree (SET): a node = (FSM state,
// tracked attribute values); a guarded transition splits into one edge per
// guard ("this fires given every earlier guard in the chain was false") plus,
// if no unconditional catch-all exists, a trailing "all guards false, signal
// dropped" edge. A path that reaches a node whose (state, known attribute
// values) exactly matches an already-visited node stops there (subsumption)
// — this is what makes a cyclic machine's exploration terminate. A depth
// bound is a backstop for genuinely-unbounded branches only.

const MAX_DEPTH = 40;

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

  function makeEdge(sourceNodeId, targetNodeId, transitionId, branch, guardFork, event) {
    const id = nanoid(8);
    edgesById.set(id, { id, sourceNodeId, targetNodeId, transitionId, branch, guardFork, event });
    return id;
  }

  // Applies one transition (effect, then the target state's entry action) and
  // creates the resulting child node — either a fresh 'open' node (which gets
  // recursively expanded) or a 'leaf-subsumed'/'leaf-final' node.
  function fireTransition(node, t, trigger, branch, guardFork) {
    const sourceState = machine.states.find((s) => s.id === node.stateId);
    const event = eventFor(trigger, sourceState?.entry);
    const targetState = machine.states.find((s) => s.id === t.target);

    let childValues = applyActionCode(t.effect, attrIndex, node.attrValues);

    if (targetState?.kind === 'final') {
      const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'leaf-final');
      const edgeId  = makeEdge(node.id, childId, t.id, branch, guardFork, event);
      nodesById.get(childId).parentEdgeId = edgeId;
      return;
    }

    childValues = applyActionCode(targetState.entry, attrIndex, childValues);
    const sig = signatureOf(targetState.id, childValues);
    const existingId = visited.get(sig);

    if (existingId) {
      const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'leaf-subsumed');
      nodesById.get(childId).subsumedByNodeId = existingId;
      const edgeId = makeEdge(node.id, childId, t.id, branch, guardFork, event);
      nodesById.get(childId).parentEdgeId = edgeId;
      return;
    }

    const childId = makeNode(targetState.id, childValues, node.depth + 1, null, 'open');
    const edgeId  = makeEdge(node.id, childId, t.id, branch, guardFork, event);
    const childNode = nodesById.get(childId);
    childNode.parentEdgeId = edgeId;
    visited.set(sig, childId);
    expand(childNode);
  }

  // The "all guards false, signal dropped" outcome: a leaf that subsumes
  // straight back into the source node (nothing changed) — reuses the
  // subsumption machinery instead of special-casing "no-op" edges.
  function fireDropped(node, trigger) {
    const sourceState = machine.states.find((s) => s.id === node.stateId);
    const event = eventFor(trigger, sourceState?.entry);
    const droppedId = makeNode(node.stateId, node.attrValues, node.depth + 1, null, 'leaf-subsumed');
    nodesById.get(droppedId).subsumedByNodeId = node.id;
    const edgeId = makeEdge(node.id, droppedId, null, 'all-guards-false', true, event);
    nodesById.get(droppedId).parentEdgeId = edgeId;
  }

  function expand(node) {
    if (node.depth >= MAX_DEPTH) { node.status = 'leaf-depth-bound'; return; }

    const outgoing = machine.transitions.filter((t) => t.source === node.stateId && t.trigger && t.trigger.trim());
    if (outgoing.length === 0) { node.status = 'leaf-deadend'; return; }

    node.status = 'open';

    const groups = new Map();
    for (const t of outgoing) {
      if (!groups.has(t.trigger)) groups.set(t.trigger, []);
      groups.get(t.trigger).push(t);
    }

    for (const [trigger, group] of groups) {
      let hitUnconditional = false;
      for (let i = 0; i < group.length; i++) {
        const t = group[i];
        const guardText = t.guard && t.guard.trim();
        const branch = guardText ? `guard-${i}-true` : 'unconditional';
        const guardFork = group.length > 1 || !!guardText;
        fireTransition(node, t, trigger, branch, guardFork);
        if (!guardText) { hitUnconditional = true; break; } // matches dispatch()'s if/else-if: an unconditional match makes later members dead code
      }
      if (!hitUnconditional) fireDropped(node, trigger); // every member in the chain was guarded — a real "all false" outcome exists
    }
  }

  let startValues = applyActionCode(initTransition.effect, attrIndex, rootValues);
  startValues = applyActionCode(startTarget.entry, attrIndex, startValues);

  const rootId = makeNode(startTarget.id, startValues, 0, null, 'open');
  visited.set(signatureOf(startTarget.id, startValues), rootId);
  expand(nodesById.get(rootId));

  return { nodesById, edgesById, rootId, classId };
}
