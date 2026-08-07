import { getAllAttributes } from './modelHelpers.js';
import { pathToLeaf } from './symbolicExecution.js';
import {
  generateJavaCode, toClassName, toPackageName, capitalize, safeId,
  portFieldName, stateConstMap, resolveSignalParams, safeEnumConst,
  isMultiRelation, getRelationFieldName,
} from './javaCodeGen.js';
import { getProtocolById } from '../store/modelStore.js';

// Exported so the SET Viewer can label a "subsumed -> X" backreference with
// the same name/attribute summary used everywhere else, instead of an
// opaque id fragment.
export function stateName(node, machine) {
  if (node.status === 'leaf-final') return 'Final';
  if (!node.stateId) return '(unresolved)';
  return machine?.states.find((s) => s.id === node.stateId)?.name || '(unnamed)';
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
    guardReason: edge.guardReason ?? null,
  }));

  const guardForkPresent = steps.some((s) => s.guardFork);

  const knownAttrs = attrs
    .map((a) => ({ name: a.name, v: leaf.attrValues.get(a.id) }))
    .filter((a) => a.v?.kind === 'known');
  const attrPart = knownAttrs.length ? `, ${knownAttrs.map((a) => `${a.name}=${a.v.value}`).join(', ')}` : '';

  let outcome;
  if (leaf.status === 'leaf-depth-bound') {
    // The leaf itself is a real, well-defined point (state + whatever
    // attribute values are known there) — exploration just didn't continue
    // past it. That's asserted exactly like any other leaf; only the label
    // differs, to disclose that the path isn't fully explored beyond here.
    outcome = { kind: 'depth-bound', label: `Exploration limit reached — asserting the state reached so far: ${stateName(leaf, machine)}${attrPart}. The path continues beyond this point (not fully explored).` };
  } else if (leaf.status === 'leaf-subsumed') {
    const target = nodesById.get(leaf.subsumedByNodeId);
    outcome = {
      kind: 'subsumed',
      label: `Returns to an already-explored state (${stateName(target, machine)}) — no further behaviour to test here.`,
    };
  } else if (leaf.status === 'leaf-final') {
    outcome = { kind: 'final', label: 'Capsule reaches its Final state.' };
  } else {
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

// How many target-class instances to synthesize for a composition relation
// when building an ISOLATED MBT test — mirrors targetMultiplicity as closely
// as a static count reasonably can: a bare number ("2") gives exactly that
// many, a range's upper bound ("1..3" -> 3) gives that many, and anything
// unbounded (bare "*", or an "N..*" range) falls back to one representative
// instance, since there's no way to know how many the real system would
// have. Never 0 — even a lowerBound-0 relation still needs one instance for
// action code that unconditionally indexes into it (e.g. players.get(0)) to
// not throw.
function compositionInstanceCount(rel) {
  const mult = (rel.targetMultiplicity || '').trim();
  if (!mult || mult === '*') return 1;
  const upperStr = mult.includes('..') ? mult.split('..')[1].trim() : mult;
  if (upperStr === '*') return 1;
  const n = parseInt(upperStr, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

// Composition relations sourced from the capsule under test also need
// something wired in for an isolated MBT test — action code that reaches
// into a composition-derived field (e.g. "players.get(0).getName()", the
// RPS example's own winner computation) throws on an empty/null field
// otherwise, since MBT never instantiates any OTHER capsule/class alongside
// the one under test. Synthesizes a small number of bare (default-
// constructor) instances of the target class per relation and wires them in
// the same way javaCodeGen.js's own relationWireLines does for a real
// instance model. A plain `new Target()` already gets safe (non-null,
// zero/empty) values for every required attribute — generateClassFile
// always initializes those (see javaCodeGen.js's field-declaration codegen)
// — so no explicit attribute values need setting here.
function compositionStubLines(cls, metaModel, varName) {
  const rels = (metaModel.relations ?? []).filter((r) => r.kind === 'COMPOSITION' && r.source === cls.id);
  if (rels.length === 0) return [];
  const lines = ['        // Wire composition relations (synthetic instances for isolated testing)'];
  let counter = 0;
  for (const rel of rels) {
    const targetCls = metaModel.classes.find((c) => c.id === rel.target);
    if (!targetCls) continue;
    const field = getRelationFieldName(rel, targetCls);
    const cap = capitalize(field);
    const setter = isMultiRelation(rel) ? 'add' : 'set';
    for (let i = 0; i < compositionInstanceCount(rel); i++) {
      const stubVar = `_stub${++counter}`;
      lines.push(`        ${targetCls.name} ${stubVar} = new ${targetCls.name}();`);
      lines.push(`        ${varName}.${setter}${cap}(${stubVar});`);
    }
  }
  lines.push('');
  return lines;
}

// A signal event whose path went through an enum-parameter fork (see
// enumParamCombos in symbolicExecution.js) carries the exact literal(s) that
// fired it in edge.paramLabel (comma-joined if the signal ever had more than
// one enum parameter, though realistically always exactly one) — resolves
// those back into real Java argument expressions (EnumClass.LITERAL) so the
// receiver call actually compiles. The receiver's method signature now
// genuinely requires an argument for an ENUM parameter (javaTypeForParam
// resolves it to the real enum class, not a fallback String), so the old
// always-zero-args call would no longer compile for these.
function signalCallArgs(edge, cls, metaModel) {
  if (!edge.paramLabel) return '';
  const triggerVal = `${edge.event.port}.${edge.event.signal}`;
  const enumParams = resolveSignalParams(triggerVal, cls, metaModel).filter((p) => p.type === 'ENUM');
  const literals = edge.paramLabel.split(', ');
  return enumParams.map((p, i) => {
    const enumDef = (metaModel.enumerations ?? []).find((e) => e.id === p.enumId);
    return enumDef ? `${toClassName(enumDef.name)}.${safeEnumConst(literals[i])}` : literals[i];
  }).join(', ');
}

function testScriptLines(edgeChain, varName, schedulerVar, cls, metaModel) {
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
      lines.push(`        ${varName}.get${cap}Receiver().${safeId(edge.event.signal)}(${signalCallArgs(edge, cls, metaModel)});`);
    }
  });
  return lines;
}

// Renders a tracked value as a Java expression matching the getter's return
// type, so MBTAssert.assertEquals's String-normalized comparison lines up
// (an enum getter's value stringifies to its bare constant name via the
// default Enum.toString(), same as how the value is tracked here). DOUBLE
// needs a `(double)` cast, not a bare literal: a whole-number tracked value
// like "20" would otherwise emit as the int literal `20`, which autoboxes
// to Integer("20") and never string-equals the getter's real Double("20.0")
// — a guaranteed spurious FAIL for any whole-number double value. The cast
// forces Java to see a double regardless of whether the source string has a
// decimal point.
function attrLiteralForAssert(value, attr) {
  if (attr.type === 'DOUBLE') return `(double) ${value}`;
  if (attr.type === 'BOOLEAN' || attr.type === 'INT') return value;
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// trackOk: when true (the "Generate All Tests" case), each assertion updates
// a running `ok` local instead of asserting standalone — lets the caller
// aggregate a per-test pass/fail without short-circuiting past later checks.
// A depth-bound leaf asserts exactly like any other leaf — it's still a
// real, well-defined (state, known attributes) point, exploration just
// didn't continue past it.
function assertionLines(leaf, machine, attrs, varName, trackOk) {
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
// A depth-bound leaf gets the same treatment — it's still a real,
// well-defined (state, known attributes) point, just one exploration didn't
// continue past; only the leading println differs, disclosing that the
// path isn't fully explored beyond this point. Returns null only for an
// unknown leaf id.
export function generateConcreteTestFiles(leafId, setResult, cls, metaModel) {
  const path = pathToLeaf(leafId, setResult);
  if (!path) return null;
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
  lines.push(...compositionStubLines(cls, metaModel, varName));
  lines.push(`        ${varName}.start();`);
  lines.push('');
  lines.push(...testScriptLines(edgeChain, varName, schedulerVar, cls, metaModel));
  lines.push('');
  if (leaf.status === 'leaf-depth-bound') {
    lines.push('        System.out.println("(exploration limit reached — asserting the state reached so far; path continues beyond this point)");');
  }
  lines.push(...assertionLines(leaf, machine, attrs, varName, false));
  lines.push('    }', '}');

  files.push({ path: `${pkgDir}/${testClassName}.java`, content: lines.join('\n') });

  return { files, mainClassPath: `${pkgDir}/${testClassName}.java` };
}

// A single file with one PRIVATE METHOD per non-open leaf (fresh capsule +
// scheduler each time, returns pass/fail) and a main() that just calls them
// in sequence and tallies the total — 100% path coverage as one runnable
// suite, per the confirmed design. Depth-bound leaves are included too and
// asserted exactly like any other leaf — the leaf itself is still a real,
// well-defined (state, known attributes) point, exploration just didn't
// continue past it. Each test's construct/wire/run/assert body lives in its
// OWN method specifically so main() stays a short, constant-size-per-call
// dispatch list: Java caps a single
// method's bytecode at 64KB, and with real path-coverage suites easily
// reaching hundreds of leaves, inlining every body directly into main()
// (the original design) hit that limit — a call site costs a few bytes
// regardless of how large the callee's own body is, so this scales to far
// larger suites before running into the same wall.
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

  const leaves = [...nodesById.values()].filter((n) => n.status !== 'open');

  const testClassName = `${cls.name}AllTests`;
  const varName = 'capsule';
  const schedulerVar = 'scheduler';

  const methodLines = [];

  leaves.forEach((leaf, i) => {
    const methodName = `test${i + 1}`;
    const path = pathToLeaf(leaf.id, setResult);

    methodLines.push(`    private static boolean ${methodName}() {`);
    methodLines.push(`        System.out.println("--- Test ${i + 1} of ${leaves.length} ---");`);
    if (needsScheduler) methodLines.push(`        TestScheduler ${schedulerVar} = new TestScheduler();`);
    methodLines.push(`        ${cls.name} ${varName} = new ${cls.name}(${needsScheduler ? schedulerVar : ''});`);
    methodLines.push(...stubWireLines(cls, metaModel, varName));
    methodLines.push(...compositionStubLines(cls, metaModel, varName));
    methodLines.push(`        ${varName}.start();`);
    methodLines.push(...testScriptLines(path.edgeChain, varName, schedulerVar, cls, metaModel));
    if (leaf.status === 'leaf-depth-bound') {
      methodLines.push('        System.out.println("(exploration limit reached — asserting the state reached so far; path continues beyond this point)");');
    }
    methodLines.push(...assertionLines(leaf, machine, attrs, varName, true));
    methodLines.push('        return ok;');
    methodLines.push('    }', '');
  });

  // main() looks up and calls test1()..testN() by name via reflection
  // instead of listing a call site per test — a constant-size loop no
  // matter how many leaves the suite has, rather than 2 lines of dispatch
  // code per test (which itself was already a fix for the same 64KB limit
  // the per-test-method split addresses — see the comment above).
  const lines = [`package ${pkgName};`, '', `public class ${testClassName} {`, ''];
  lines.push('    public static void main(String[] args) throws Exception {');
  lines.push('        int total = 0, failed = 0;');
  lines.push(`        int testCount = ${leaves.length};`, '');
  lines.push('        for (int i = 1; i <= testCount; i++) {');
  lines.push(`            java.lang.reflect.Method m = ${testClassName}.class.getDeclaredMethod("test" + i);`);
  lines.push('            m.setAccessible(true);');
  lines.push('            boolean ok = (boolean) m.invoke(null);');
  lines.push('            if (!ok) failed++;');
  lines.push('            total++;');
  lines.push('        }');
  lines.push('');
  lines.push('        System.out.println(total + " tests, " + (total - failed) + " passed, " + failed + " failed.");');
  lines.push('    }', '');
  lines.push(...methodLines);
  lines.push('}');

  files.push({ path: `${pkgDir}/${testClassName}.java`, content: lines.join('\n') });

  return { files, mainClassPath: `${pkgDir}/${testClassName}.java` };
}
