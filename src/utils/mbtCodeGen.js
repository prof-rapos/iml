import { getAllAttributes } from './modelHelpers.js';
import {
  generateJavaCode, toClassName, toPackageName, capitalize, safeId,
  portFieldName, stateConstMap,
} from './javaCodeGen.js';
import { getProtocolById } from '../store/modelStore.js';

function stateName(node, machine) {
  if (node.status === 'leaf-final') return 'Final';
  if (!node.stateId) return '(unresolved)';
  return machine?.states.find((s) => s.id === node.stateId)?.name || '(unnamed)';
}

// Walks a leaf's parentEdgeId chain back to the root and reverses it into a
// root-to-leaf event sequence — the SET's own path structure IS the test
// case, this just reads it back out.
function pathToLeaf(leafId, setResult) {
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
  return { leaf, edgeChain };
}

// The human-readable, code-unaware test case for Panel 2: an ordered list of
// input blocks (timer fires / signal received), plus what the path expects
// to hold true at the end (or why it doesn't have a fixed endpoint, for a
// subsumed/depth-bound leaf).
export function generateAbstractTestCase(leafId, setResult, metaModel) {
  const path = pathToLeaf(leafId, setResult);
  if (!path) return null;
  const { leaf, edgeChain } = path;
  const { nodesById, classId } = setResult;

  const machine = metaModel.behaviours?.[classId];
  const attrs = getAllAttributes(classId, metaModel);

  const steps = edgeChain.map((edge) => ({
    kind: edge.event.kind, // 'timeout' | 'signal'
    label: edge.event.kind === 'timeout'
      ? `Timer fires on "${edge.event.port}"${edge.event.msLabel ? ` (~${edge.event.msLabel}ms)` : ' — duration not statically known'}`
      : `Receive ${edge.event.port}.${edge.event.signal}`,
    guardFork: edge.guardFork,
  }));

  const guardForkPresent = steps.some((s) => s.guardFork);

  let outcome;
  if (leaf.status === 'leaf-depth-bound') {
    outcome = { kind: 'depth-bound', label: 'Path continues beyond the exploration depth limit — no fixed endpoint to assert.' };
  } else if (leaf.status === 'leaf-subsumed') {
    const target = nodesById.get(leaf.subsumedByNodeId);
    outcome = {
      kind: 'subsumed',
      label: `Returns to an already-explored state (${stateName(target, machine)}) — no further behaviour to test here.`,
    };
  } else if (leaf.status === 'leaf-final') {
    outcome = { kind: 'final', label: 'Capsule reaches its Final state.' };
  } else {
    const knownAttrs = attrs
      .map((a) => ({ name: a.name, v: leaf.attrValues.get(a.id) }))
      .filter((a) => a.v?.kind === 'known');
    const attrPart = knownAttrs.length ? `, ${knownAttrs.map((a) => `${a.name}=${a.v.value}`).join(', ')}` : '';
    outcome = { kind: 'assert', label: `Expect state: ${stateName(leaf, machine)}${attrPart}` };
  }

  return { steps, outcome, guardForkPresent, leafStatus: leaf.status };
}

// ══════════════════════════════════════════════════════════════════════════
// CONCRETE JAVA TEST GENERATION
// Drives Module 3's own generated capsule class through a leaf's event
// sequence, in isolation, via scripted stub peers. No JUnit — plain println
// PASS/FAIL, matching the rest of this tool's teaching-level simplicity.
// ══════════════════════════════════════════════════════════════════════════

function generateTestSchedulerFile(pkg) {
  return `package ${pkg};

import java.util.PriorityQueue;

// Test-only Scheduler: fires timers instantly in due-order (no real-time
// wait) instead of sleeping — a test doesn't need to know which informIn/
// informEvery call armed a timer (Module 3 can't distinguish that either),
// only that "the next thing due" fires. A drop-in wherever a Scheduler is
// expected (it IS one) — Scheduler's methods aren't final and TimerHandle's
// fields are package-visible, so this needed zero changes to Module 3's
// Scheduler.java.
public class TestScheduler extends Scheduler {
    private final PriorityQueue<TimerHandle> queue =
        new PriorityQueue<>((a, b) -> Long.compare(a.dueAt, b.dueAt));
    private long now = 0;

    @Override
    public TimerHandle schedule(long delayMs, long periodMs, TimerCallback callback) {
        TimerHandle t = new TimerHandle();
        t.dueAt = now + delayMs;
        t.periodMs = periodMs;
        t.callback = callback;
        queue.add(t);
        return t;
    }

    @Override
    public void cancel(TimerHandle handle) {
        if (handle != null) handle.cancelled = true;
    }

    // Pops and fires the next non-cancelled timer instantly. Returns false
    // if nothing was pending (a test script should never hit this).
    public boolean fireNext() {
        while (!queue.isEmpty()) {
            TimerHandle next = queue.poll();
            if (next.cancelled) continue;
            now = next.dueAt;
            if (next.periodMs > 0) {
                next.dueAt = now + next.periodMs;
                queue.add(next);
            }
            next.callback.onTimeout();
            return true;
        }
        return false;
    }

    @Override
    public void run() {
        // Unused by generated tests — fireNext() drives the script instead.
    }
}
`;
}

function generateMbtAssertFile(pkg) {
  return `package ${pkg};

import java.util.Objects;

// Minimal, framework-free test reporting for generated Model-Based Testing
// test cases — prints PASS/FAIL to stdout, no JUnit dependency.
public class MBTAssert {
    public static boolean assertEquals(String label, Object expected, Object actual) {
        String expectedStr = expected == null ? null : String.valueOf(expected);
        String actualStr = actual == null ? null : String.valueOf(actual);
        boolean pass = Objects.equals(expectedStr, actualStr);
        System.out.println((pass ? "PASS" : "FAIL") + ": " + label
            + (pass ? "" : " (expected " + expectedStr + ", got " + actualStr + ")"));
        return pass;
    }
}
`;
}

function usesTimingPort(cls) {
  return (cls.ports ?? []).some((p) => p.protocolId === 'sys-timing');
}

// Every user-protocol port needs a wired peer regardless of whether this
// test's script touches it — an unconnected port's peer field is null, and
// any send through it (e.g. an entry action's port.signal() call) NPEs.
// To *inject* a receive event the script calls capsule.get<Port>Receiver()
// directly, so these stubs only need to satisfy the send side (no-op is fine
// — the interface's own default methods already are one).
function stubWireLines(cls, metaModel, varName) {
  const lines = [];
  for (const port of cls.ports ?? []) {
    const proto = getProtocolById(port.protocolId, metaModel);
    if (!proto || proto.system) continue;
    const iface = toClassName(proto.name) + 'Receiver';
    const cap = capitalize(portFieldName(port));
    lines.push(`        ${varName}.connect${cap}(new ${iface}() {});`);
  }
  return lines;
}

function testScriptLines(edgeChain, varName, schedulerVar) {
  const lines = [];
  edgeChain.forEach((edge, i) => {
    if (edge.guardFork) {
      lines.push('        // GUARD FORK: this path\'s outcome depends on an unverified guard condition');
    }
    if (edge.event.kind === 'timeout') {
      lines.push(`        // Step ${i + 1}: timer fires on "${edge.event.port}"`);
      lines.push(`        ${schedulerVar}.fireNext();`);
    } else {
      lines.push(`        // Step ${i + 1}: receive ${edge.event.port}.${edge.event.signal}`);
      const cap = capitalize(edge.event.port);
      lines.push(`        ${varName}.get${cap}Receiver().${safeId(edge.event.signal)}();`);
    }
  });
  return lines;
}

// Renders a tracked value as a Java expression matching the getter's return
// type, so MBTAssert.assertEquals's String-normalized comparison lines up
// (an enum getter's value stringifies to its bare constant name via the
// default Enum.toString(), same as how the value is tracked here).
function attrLiteralForAssert(value, attr) {
  if (attr.type === 'BOOLEAN' || attr.type === 'INT' || attr.type === 'DOUBLE') return value;
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// trackOk: when true (the "Generate All Tests" case), each assertion updates
// a running `ok` local instead of asserting standalone — lets the caller
// aggregate a per-test pass/fail without short-circuiting past later checks.
function assertionLines(leaf, machine, attrs, varName, trackOk) {
  if (leaf.status === 'leaf-depth-bound') return []; // no fixed endpoint to assert

  const lines = [];
  const stateConsts = stateConstMap(machine);
  // A Final-state leaf has no State enum constant (Final isn't a simple
  // state) — Module 3 sets currentState = null on reaching it instead.
  const expectedStateConst = leaf.status === 'leaf-final' ? null : stateConsts.get(leaf.stateId);
  const stateExpr = expectedStateConst ? `"${expectedStateConst}"` : 'null';

  const assertCall = (label, expected) =>
    `MBTAssert.assertEquals("${label}", ${expected}, ${varName}.get${label === 'state' ? 'CurrentStateName' : capitalize(safeId(label))}())`;

  if (trackOk) lines.push('        boolean ok = true;');
  const emit = (label, expected) => {
    const call = assertCall(label, expected);
    lines.push(trackOk ? `        if (!${call}) ok = false;` : `        ${call};`);
  };

  emit('state', stateExpr);
  for (const attr of attrs) {
    const v = leaf.attrValues.get(attr.id);
    if (v?.kind !== 'known') continue;
    emit(attr.name, attrLiteralForAssert(v.value, attr));
  }
  return lines;
}

// One runnable test file for a single leaf: constructs the capsule under
// test in isolation (stub peers on every port), drives it through the
// leaf's event sequence, then asserts the expected end state/attributes.
// Returns null for a depth-bound leaf (no fixed endpoint — visualization
// only, per the confirmed design) or an unknown leaf id.
export function generateConcreteTestFiles(leafId, setResult, cls, metaModel) {
  const path = pathToLeaf(leafId, setResult);
  if (!path || path.leaf.status === 'leaf-depth-bound') return null;
  const { leaf, edgeChain } = path;
  const { classId } = setResult;

  const machine = metaModel.behaviours?.[classId];
  const attrs = getAllAttributes(classId, metaModel);
  const pkgName = `iml.${toPackageName(metaModel.name)}`;
  const pkgDir = `iml/${toPackageName(metaModel.name)}`;

  // Reuse Module 3's own codegen for every capsule/enum/protocol/runtime
  // file — sidesteps re-implementing dependency resolution (inheritance,
  // enums); unused classes riding along in the bundle are harmless.
  const files = generateJavaCode(metaModel, [], 'behavioural');

  const needsScheduler = usesTimingPort(cls);
  if (needsScheduler) files.push({ path: `${pkgDir}/TestScheduler.java`, content: generateTestSchedulerFile(pkgName) });
  files.push({ path: `${pkgDir}/MBTAssert.java`, content: generateMbtAssertFile(pkgName) });

  // nanoid ids can contain "-", which isn't a valid Java identifier
  // character (unlike "_", which is fine) — sanitize before embedding.
  const testClassName = `${cls.name}Test_${leafId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 6)}`;
  const varName = 'capsule';
  const schedulerVar = 'scheduler';

  const lines = [`package ${pkgName};`, '', `public class ${testClassName} {`, '', '    public static void main(String[] args) {'];
  if (needsScheduler) lines.push(`        TestScheduler ${schedulerVar} = new TestScheduler();`);
  lines.push(`        ${cls.name} ${varName} = new ${cls.name}(${needsScheduler ? schedulerVar : ''});`);
  lines.push(...stubWireLines(cls, metaModel, varName));
  lines.push(`        ${varName}.start();`);
  lines.push('');
  lines.push(...testScriptLines(edgeChain, varName, schedulerVar));
  lines.push('');
  lines.push(...assertionLines(leaf, machine, attrs, varName, false));
  lines.push('    }', '}');

  files.push({ path: `${pkgDir}/${testClassName}.java`, content: lines.join('\n') });

  return { files, mainClassPath: `${pkgDir}/${testClassName}.java` };
}

// A single file whose main() runs every non-open, non-depth-bound leaf as
// its own isolated test case in sequence (fresh capsule + scheduler each
// time), printing PASS/FAIL per assertion and an overall summary — 100%
// path coverage as one runnable suite, per the confirmed design.
export function generateAllTestsFiles(setResult, cls, metaModel) {
  const { nodesById, classId } = setResult;
  const machine = metaModel.behaviours?.[classId];
  const attrs = getAllAttributes(classId, metaModel);
  const pkgName = `iml.${toPackageName(metaModel.name)}`;
  const pkgDir = `iml/${toPackageName(metaModel.name)}`;

  const files = generateJavaCode(metaModel, [], 'behavioural');
  const needsScheduler = usesTimingPort(cls);
  if (needsScheduler) files.push({ path: `${pkgDir}/TestScheduler.java`, content: generateTestSchedulerFile(pkgName) });
  files.push({ path: `${pkgDir}/MBTAssert.java`, content: generateMbtAssertFile(pkgName) });

  const leaves = [...nodesById.values()].filter((n) => n.status !== 'open' && n.status !== 'leaf-depth-bound');

  const testClassName = `${cls.name}AllTests`;
  const varName = 'capsule';
  const schedulerVar = 'scheduler';

  const lines = [`package ${pkgName};`, '', `public class ${testClassName} {`, '', '    public static void main(String[] args) {'];
  lines.push('        int total = 0, failed = 0;', '');

  leaves.forEach((leaf, i) => {
    const path = pathToLeaf(leaf.id, setResult);
    lines.push(`        // ── Test ${i + 1} ───────────────────────────────────`);
    lines.push('        {');
    lines.push('            total++;');
    lines.push(`            System.out.println("--- Test ${i + 1} of ${leaves.length} ---");`);
    if (needsScheduler) lines.push(`            TestScheduler ${schedulerVar} = new TestScheduler();`);
    lines.push(`            ${cls.name} ${varName} = new ${cls.name}(${needsScheduler ? schedulerVar : ''});`);
    lines.push(...stubWireLines(cls, metaModel, varName).map((l) => '    ' + l));
    lines.push(`            ${varName}.start();`);
    lines.push(...testScriptLines(path.edgeChain, varName, schedulerVar).map((l) => '    ' + l));
    lines.push(...assertionLines(leaf, machine, attrs, varName, true).map((l) => '    ' + l));
    lines.push('            if (!ok) failed++;');
    lines.push('        }', '');
  });

  lines.push('        System.out.println(total + " tests, " + (total - failed) + " passed, " + failed + " failed.");');
  lines.push('    }', '}');

  files.push({ path: `${pkgDir}/${testClassName}.java`, content: lines.join('\n') });

  return { files, mainClassPath: `${pkgDir}/${testClassName}.java` };
}
