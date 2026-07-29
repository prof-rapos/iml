import { getAllAttributes } from './modelHelpers.js';
import { capsuleMessages, getProtocolById } from '../store/modelStore.js';

// ── String / naming helpers ───────────────────────────────────────────────────

export function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function safeId(name) {
  const sanitized = (name || 'field')
    .replace(/[^a-zA-Z0-9_$\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => i === 0
      ? w.charAt(0).toLowerCase() + w.slice(1)
      : capitalize(w))
    .join('');
  return sanitized || '_field';
}

export function toClassName(name) {
  const sanitized = (name || 'Class')
    .replace(/[^a-zA-Z0-9_$\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join('');
  return sanitized || 'GeneratedClass';
}

export function toPackageName(name) {
  return (name || 'model')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') || 'model';
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function javaType(type) {
  switch (type) {
    case 'INT':     return 'int';
    case 'DOUBLE':  return 'double';
    case 'BOOLEAN': return 'boolean';
    default:        return 'String';
  }
}

function boxedType(type) {
  switch (type) {
    case 'INT':     return 'Integer';
    case 'DOUBLE':  return 'Double';
    case 'BOOLEAN': return 'Boolean';
    default:        return 'String';
  }
}

function defaultValue(type) {
  switch (type) {
    case 'INT':     return '0';
    case 'DOUBLE':  return '0.0';
    case 'BOOLEAN': return 'false';
    default:        return '""';
  }
}

function javaLiteral(value, type) {
  switch (type) {
    case 'INT':     return String(parseInt(value, 10)  || 0);
    case 'DOUBLE':  return String(parseFloat(value)    || 0.0);
    case 'BOOLEAN': return value === 'true' ? 'true' : 'false';
    default:        return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
}

// ── Enum helpers ──────────────────────────────────────────────────────────────
// An attribute with type 'ENUM' points at a meta-model enumeration via enumId.
// These wrappers resolve the enum so the primitive type helpers stay untouched.
function enumOf(attr, metaModel) {
  if (attr.type !== 'ENUM') return null;
  return (metaModel.enumerations ?? []).find((e) => e.id === attr.enumId) ?? null;
}

// Sanitise a literal into a valid Java identifier, preserving its case.
function safeEnumConst(name) {
  const s = String(name ?? '').replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^(?=\d)/, '_');
  return s || '_LITERAL';
}

function javaTypeForAttr(attr, metaModel) {
  const e = enumOf(attr, metaModel);
  return e ? toClassName(e.name) : javaType(attr.type);
}

function boxedTypeForAttr(attr, metaModel) {
  const e = enumOf(attr, metaModel);
  return e ? toClassName(e.name) : boxedType(attr.type);
}

function defaultValueForAttr(attr, metaModel) {
  const e = enumOf(attr, metaModel);
  return e ? 'null' : defaultValue(attr.type);
}

function javaLiteralForAttr(value, attr, metaModel) {
  const e = enumOf(attr, metaModel);
  return e ? `${toClassName(e.name)}.${safeEnumConst(value)}` : javaLiteral(value, attr.type);
}

function generateEnumFile(en, pkg) {
  // Distinct literals can sanitize to the same identifier (e.g. "A!" and "A?"
  // both strip to "A_") — suffix repeats so the generated enum still compiles.
  const seen = new Map();
  const consts = (en.literals ?? []).map((lit) => {
    const base  = safeEnumConst(lit);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });
  return [
    `package ${pkg};`,
    '',
    `public enum ${toClassName(en.name)} {`,
    consts.length ? `    ${consts.join(', ')}` : '    // no literals defined',
    '}',
  ].join('\n');
}

// ── Inheritance helpers ───────────────────────────────────────────────────────

function getParentClass(classId, metaModel) {
  const rel = metaModel.relations.find(r => r.kind === 'INHERITANCE' && r.source === classId);
  return rel ? (metaModel.classes.find(c => c.id === rel.target) ?? null) : null;
}

// ── Relation helpers ──────────────────────────────────────────────────────────

function isMultiRelation(rel) {
  const mult = (rel.targetMultiplicity || '').trim();
  if (!mult) return false;
  if (mult === '*') return true;
  if (mult.includes('..')) {
    const upper = mult.split('..')[1].trim();
    return upper === '*' || parseInt(upper, 10) > 1;
  }
  const n = parseInt(mult, 10);
  return !isNaN(n) && n > 1;
}

function getRelationFieldName(rel, targetCls) {
  if (rel.name && rel.name.trim()) return safeId(rel.name);
  const base = safeId(targetCls.name);
  return isMultiRelation(rel) ? base + 'List' : base;
}

// ── ASCII art class header ────────────────────────────────────────────────────
// Each line (incl. " * " prefix) has length: BOX_INNER + 7
// Separator : " * " + "=" * (BOX_INNER + 4)
// Box line  : " * ||" + BOX_INNER chars + "||"

function generateAsciiComment(cls, metaModel, parent, relations) {
  const VISIBILITY = { PUBLIC: '+', PRIVATE: '-', PROTECTED: '#' };

  // ── Collect content strings to compute required width ──────────────
  const headerName    = cls.isAbstract ? `«${cls.name}»` : cls.name;
  const headerExtends = parent ? `extends ${parent.name}` : null;

  const attrStrings = cls.attributes.map(a => {
    const vis   = VISIBILITY[a.visibility] || '+';
    const upper = a.upperBound === -1 ? '*' : a.upperBound;
    return `[${a.lowerBound}..${upper}]  ${vis}  ${a.name} : ${a.type}`;
  });

  const relStrings = relations.map(rel => {
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) return null;
    const label   = rel.name && rel.name.trim() ? rel.name : rel.kind.toLowerCase();
    const srcMult = rel.sourceMultiplicity ? `[${rel.sourceMultiplicity}] ` : '';
    const tgtMult = rel.targetMultiplicity ? ` [${rel.targetMultiplicity}]` : '';
    return `${srcMult}${label} --> ${targetCls.name}${tgtMult}`;
  }).filter(Boolean);

  // BOX_INNER = chars between the || delimiters (includes padding)
  const candidates = [
    headerName,
    headerExtends,
    'Attributes',
    ...attrStrings,
    relStrings.length > 0 ? 'Relations' : null,
    ...relStrings,
  ].filter(Boolean);

  const MIN_INNER = 44;
  // data lines use "  text  " so need text.length + 2 minimum inner width
  const BOX_INNER = Math.max(MIN_INNER, ...candidates.map(s => s.length + 4));

  // ── Box-drawing helpers ────────────────────────────────────────────
  const sep = ` * ${'='.repeat(BOX_INNER + 4)}`;

  const center = (s) => {
    const pad   = BOX_INNER - s.length;
    const left  = Math.floor(pad / 2);
    const right = pad - left;
    return ` * ||${' '.repeat(left)}${s}${' '.repeat(right)}||`;
  };

  const data = (s) => {
    const pad = BOX_INNER - 2 - s.length; // 1 space each side inside ||
    return ` * || ${s}${' '.repeat(Math.max(0, pad))} ||`;
  };

  // ── Build comment ──────────────────────────────────────────────────
  const lines = ['/*', sep];

  lines.push(center(headerName));
  if (headerExtends) lines.push(center(headerExtends));
  lines.push(sep);

  lines.push(center('Attributes'));
  lines.push(sep);
  if (attrStrings.length === 0) {
    lines.push(data('(none)'));
  } else {
    attrStrings.forEach(s => lines.push(data(s)));
  }

  if (relStrings.length > 0) {
    lines.push(sep);
    lines.push(center('Relations'));
    lines.push(sep);
    relStrings.forEach(s => lines.push(data(s)));
  }

  lines.push(sep);
  lines.push(' */');

  return lines.join('\n');
}

// ── Class file generator ──────────────────────────────────────────────────────

function boundsComment(attr) {
  const upper = attr.upperBound === -1 ? '*' : attr.upperBound;
  return `// [${attr.lowerBound}..${upper}] ${attr.type}`;
}

function hasMetaDefault(attr) {
  return attr.defaultValue !== undefined && String(attr.defaultValue).trim() !== '';
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPSULE / BEHAVIOURAL CODEGEN
// A "capsule" is any class with ports (cls.ports.length > 0). A capsule that
// also has a non-empty state machine (metaModel.behaviours[classId]) is
// "dispatchable": it gets a Trigger/State enum pair, start()/dispatch(), and
// enter<State>()/exit<State>() methods. A passive capsule (ports, no machine)
// still gets port fields/wiring so it compiles and can be connected, but no
// dispatch/start — its receiver overrides are just the interface's no-op
// defaults, per the settled 2026-07-28 design decision.
// ══════════════════════════════════════════════════════════════════════════════

export function isCapsuleClass(cls) {
  return (cls.ports ?? []).length > 0;
}

export function hasStateMachine(cls, metaModel) {
  const m = metaModel.behaviours?.[cls.id];
  return !!m && m.states.length > 0;
}

// "port.signal" -> "PORT_SIGNAL", a valid Java enum constant.
export function triggerConstName(value) {
  const s = String(value).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  return /^[A-Z_]/.test(s) ? s : `_${s}`;
}

export function portFieldName(port) {
  return safeId(port.name);
}

// One receiver interface per user-defined protocol, with a no-op default
// method per signal (both directions) — a class implementing it only ever
// overrides the signals it actually receives; everything else is a safe
// no-op. Keeps the interface shape trivial even for bidirectional protocols.
function generateProtocolReceiverInterface(protocol, pkg) {
  const name = toClassName(protocol.name) + 'Receiver';
  const methods = (protocol.signals ?? []).map((sig) => {
    const params = (sig.params ?? []).map((p) => `${javaType(p.type)} ${safeId(p.name)}`).join(', ');
    return `    default void ${safeId(sig.name)}(${params}) {}`;
  });
  return [
    `package ${pkg};`,
    '',
    `public interface ${name} {`,
    ...(methods.length ? methods : ['    // no signals defined']),
    '}',
  ].join('\n');
}

function generateSchedulerFile(pkg) {
  return `package ${pkg};

import java.util.PriorityQueue;

// Single-threaded real-time event loop backing every Timing port: a priority
// queue of pending timers keyed by fire time. run() sleeps until the next
// timer is due and delivers it — real wall-clock timing, deterministic, no
// thread hazards (matches the deliberately simple runtime semantics chosen
// for this teaching level; queueing/run-to-completion are left for lecture).
public class Scheduler {

    public interface TimerCallback {
        void onTimeout();
    }

    public static class TimerHandle {
        long dueAt;
        long periodMs;
        TimerCallback callback;
        boolean cancelled = false;
    }

    private final PriorityQueue<TimerHandle> queue =
        new PriorityQueue<>((a, b) -> Long.compare(a.dueAt, b.dueAt));

    public TimerHandle schedule(long delayMs, long periodMs, TimerCallback callback) {
        TimerHandle t = new TimerHandle();
        t.dueAt = System.currentTimeMillis() + delayMs;
        t.periodMs = periodMs;
        t.callback = callback;
        queue.add(t);
        return t;
    }

    public void cancel(TimerHandle handle) {
        if (handle != null) handle.cancelled = true;
    }

    public void run() {
        while (!queue.isEmpty()) {
            TimerHandle next = queue.peek();
            long wait = next.dueAt - System.currentTimeMillis();
            if (wait > 0) {
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException e) {
                    return;
                }
                continue;
            }
            queue.poll();
            if (next.cancelled) continue;
            if (next.periodMs > 0) {
                next.dueAt = System.currentTimeMillis() + next.periodMs;
                queue.add(next);
            }
            next.callback.onTimeout();
        }
    }
}
`;
}

function generateTimingPortFile(pkg) {
  return `package ${pkg};

// Generated stand-in for a capsule's Timing port: arms one-shot/recurring
// timers on the shared Scheduler and delivers "timeout" back into the
// capsule's dispatch(...) when they fire.
public class TimingPort {
    private final Scheduler scheduler;
    private final Runnable onTimeout;
    private Scheduler.TimerHandle handle;

    public TimingPort(Scheduler scheduler, Runnable onTimeout) {
        this.scheduler = scheduler;
        this.onTimeout = onTimeout;
    }

    public void informIn(int ms) {
        handle = scheduler.schedule(ms, 0, onTimeout::run);
    }

    public void informEvery(int ms) {
        handle = scheduler.schedule(ms, ms, onTimeout::run);
    }

    public void cancelTimer() {
        scheduler.cancel(handle);
    }
}
`;
}

function generateLogPortFile(pkg) {
  return `package ${pkg};

// Generated stand-in for a capsule's Log port: sys-log's "log" signal maps
// directly to stdout.
public class LogPort {
    public void log(String message) {
        System.out.println(message);
    }
}
`;
}

// Fields + (if needed) a Scheduler-taking constructor for a capsule's ports.
// System protocols (Timing/Log) get runtime-helper fields; user protocols get
// a peer reference (for sending, wired via connect<Port>()) plus a receiver
// object (for receiving, exposed via get<Port>Receiver() so a peer's
// connector wiring can target it).
function generateCapsulePorts(cls, metaModel, dispatchable) {
  const fieldLines      = [];
  const ctorAssignLines = [];
  const accessorLines   = [];
  let needsScheduler     = false;

  for (const port of cls.ports ?? []) {
    const proto = getProtocolById(port.protocolId, metaModel);
    if (!proto) continue;
    const field = portFieldName(port);
    const cap   = capitalize(field);

    if (proto.id === 'sys-timing') {
      needsScheduler = true;
      const msg = capsuleMessages(cls.id, metaModel).find((m) => m.value === `${port.name}.timeout`);
      const onTimeout = (dispatchable && msg)
        ? `() -> dispatch(Trigger.${triggerConstName(msg.value)})`
        : '() -> {}';
      // Not final: the plain/parameterized structural constructors don't
      // assign it, and Java requires every constructor to definitely-assign
      // a blank final field. It's only ever null there — those overloads
      // aren't the ones behavioural/all main() uses for a class with a
      // Timing port anyway.
      fieldLines.push(`    private TimingPort ${field};`);
      ctorAssignLines.push(`        this.${field} = new TimingPort(scheduler, ${onTimeout});`);
    } else if (proto.id === 'sys-log') {
      fieldLines.push(`    private final LogPort ${field} = new LogPort();`);
    } else {
      const iface = toClassName(proto.name) + 'Receiver';
      fieldLines.push(`    private ${iface} ${field};`);
      accessorLines.push(`    public void connect${cap}(${iface} peer) { this.${field} = peer; }`);

      const wanted   = port.conjugated ? 'out' : 'in';
      const received = (proto.signals ?? []).filter((sg) => sg.direction === wanted);
      fieldLines.push(`    private final ${iface} ${field}Receiver = new ${iface}() {`);
      if (dispatchable) {
        for (const sig of received) {
          const params    = (sig.params ?? []).map((p) => `${javaType(p.type)} ${safeId(p.name)}`).join(', ');
          const constName = triggerConstName(`${port.name}.${sig.name}`);
          fieldLines.push(`        @Override public void ${safeId(sig.name)}(${params}) { dispatch(Trigger.${constName}); }`);
        }
      }
      fieldLines.push('    };');
      accessorLines.push(`    public ${iface} get${cap}Receiver() { return ${field}Receiver; }`);
    }
  }

  return { fieldLines, ctorAssignLines, accessorLines, needsScheduler };
}

// stateId -> Java enum constant name, for every simple state.
export function stateConstMap(machine) {
  const map = new Map();
  for (const st of machine.states) {
    if (st.kind === 'simple') map.set(st.id, safeEnumConst(st.name).toUpperCase());
  }
  return map;
}

function generateStateEnum(machine, stateConsts) {
  const consts = machine.states.filter((s) => s.kind === 'simple').map((s) => stateConsts.get(s.id));
  return [
    '    private enum State {',
    consts.length ? `        ${consts.join(', ')}` : '        // no simple states defined',
    '    }',
  ];
}

function generateTriggerEnum(cls, metaModel) {
  const consts = capsuleMessages(cls.id, metaModel).map((m) => triggerConstName(m.value));
  return [
    '    private enum Trigger {',
    consts.length ? `        ${consts.join(', ')}` : '        // no receivable messages',
    '    }',
  ];
}

// start() enters whichever state the initial pseudostate's single outgoing
// transition targets — currentState is only ever set here or in enter<X>(),
// never at construction (a peer isn't wired yet at construction time).
function generateStart(machine) {
  const initial        = machine.states.find((s) => s.kind === 'initial');
  const initTransition = initial ? machine.transitions.find((t) => t.source === initial.id) : null;
  const target          = initTransition ? machine.states.find((s) => s.id === initTransition.target) : null;

  const lines = ['    public void start() {'];
  if (target && target.kind === 'simple') {
    if (initTransition.effect && initTransition.effect.trim()) {
      for (const l of initTransition.effect.split('\n')) lines.push(`        ${l}`);
    }
    lines.push(`        enter${capitalize(safeId(target.name))}();`);
  }
  lines.push('    }');
  return lines;
}

// enter<State>() sets currentState then runs the entry action; exit<State>()
// runs the exit action. The entry-action-after-currentState-assignment order
// is load-bearing: action code may reference currentState indirectly via
// sends that trigger a peer's dispatch, which must see the new state.
function generateEnterExitMethods(machine, stateConsts) {
  const lines = [];
  for (const st of machine.states) {
    if (st.kind !== 'simple') continue;
    const cap = capitalize(safeId(st.name));

    lines.push(`    private void enter${cap}() {`);
    lines.push(`        currentState = State.${stateConsts.get(st.id)};`);
    if (st.entry && st.entry.trim()) {
      for (const l of st.entry.split('\n')) lines.push(`        ${l}`);
    }
    lines.push('    }');
    lines.push('');

    lines.push(`    private void exit${cap}() {`);
    if (st.exit && st.exit.trim()) {
      for (const l of st.exit.split('\n')) lines.push(`        ${l}`);
    }
    lines.push('    }');
    lines.push('');
  }
  return lines;
}

// dispatch(Trigger) switches on currentState, then — for each distinct
// trigger leaving that state — an if/else-if chain over the candidate
// transitions' guards (an empty guard reads as unconditional "true"). The
// first matching guard's exit/effect/enter runs and returns; if none match,
// the signal is silently dropped (matches the currentState==null drop
// precedent for bootstrap safety). A transition into a Final state clears
// currentState instead of calling a (nonexistent) enter method.
function generateDispatch(machine, stateConsts) {
  const lines = [];
  lines.push('    private void dispatch(Trigger trigger) {');
  lines.push('        if (currentState == null) return;');
  lines.push('        switch (currentState) {');

  for (const st of machine.states) {
    if (st.kind !== 'simple') continue;
    const outgoing = machine.transitions.filter((t) => t.source === st.id && t.trigger && t.trigger.trim());
    if (outgoing.length === 0) continue;

    lines.push(`            case ${stateConsts.get(st.id)}:`);
    const byTrigger = new Map();
    for (const t of outgoing) {
      if (!byTrigger.has(t.trigger)) byTrigger.set(t.trigger, []);
      byTrigger.get(t.trigger).push(t);
    }
    for (const [triggerVal, transitions] of byTrigger) {
      lines.push(`                if (trigger == Trigger.${triggerConstName(triggerVal)}) {`);
      transitions.forEach((t, i) => {
        const guardText = (t.guard && t.guard.trim()) ? t.guard : 'true';
        const kw        = i === 0 ? 'if' : 'else if';
        lines.push(`                    ${kw} (${guardText}) {`);
        lines.push(`                        exit${capitalize(safeId(st.name))}();`);
        if (t.effect && t.effect.trim()) {
          for (const l of t.effect.split('\n')) lines.push(`                        ${l}`);
        }
        const tgtState = machine.states.find((s2) => s2.id === t.target);
        if (tgtState?.kind === 'final') {
          lines.push('                        currentState = null;');
        } else {
          lines.push(`                        enter${capitalize(safeId(tgtState?.name ?? ''))}();`);
        }
        lines.push('                        return;');
        lines.push('                    }');
      });
      lines.push('                }');
    }
    lines.push('                break;');
  }

  lines.push('            default:');
  lines.push('                break;');
  lines.push('        }');
  lines.push('    }');
  return lines;
}

function generateCapsuleBody(cls, metaModel) {
  const machine      = metaModel.behaviours?.[cls.id] ?? null;
  const dispatchable = hasStateMachine(cls, metaModel);
  const { fieldLines, ctorAssignLines, accessorLines, needsScheduler } = generateCapsulePorts(cls, metaModel, dispatchable);

  const lines = [];
  lines.push('    // ── Capsule ports ──────────────────────────────────────────');
  lines.push(...fieldLines);
  lines.push('');

  if (needsScheduler) {
    lines.push('    private Scheduler scheduler;'); // same not-final reasoning as the TimingPort fields above
    lines.push('');
    lines.push(`    public ${cls.name}(Scheduler scheduler) {`);
    lines.push('        this.scheduler = scheduler;');
    lines.push(...ctorAssignLines);
    lines.push('    }');
    lines.push('');
  }

  if (accessorLines.length) {
    lines.push(...accessorLines);
    lines.push('');
  }

  if (dispatchable) {
    const stateConsts = stateConstMap(machine);
    lines.push('    // ── State machine ──────────────────────────────────────────');
    lines.push(...generateStateEnum(machine, stateConsts));
    lines.push('');
    lines.push(...generateTriggerEnum(cls, metaModel));
    lines.push('');
    lines.push('    private State currentState = null;');
    lines.push('');
    lines.push('    public String getCurrentStateName() { return currentState == null ? null : currentState.name(); }');
    lines.push('');
    lines.push(...generateStart(machine));
    lines.push('');
    lines.push(...generateEnterExitMethods(machine, stateConsts));
    lines.push(...generateDispatch(machine, stateConsts));
  }

  return lines;
}

function generateClassFile(cls, metaModel, pkg, scope = 'structural') {
  const parent      = getParentClass(cls.id, metaModel);
  const ownAttrs    = cls.attributes;
  const parentAttrs = parent ? getAllAttributes(parent.id, metaModel) : [];
  const allAttrs    = getAllAttributes(cls.id, metaModel);
  const relations   = metaModel.relations.filter(
    r => r.source === cls.id && r.kind !== 'INHERITANCE'
  );

  const needsArrayList =
    allAttrs.some(a => a.upperBound !== 1) ||
    relations.some(r => isMultiRelation(r));

  const lines = [];

  lines.push(generateAsciiComment(cls, metaModel, parent, relations));
  lines.push(`package ${pkg};`);
  lines.push('');
  if (needsArrayList) {
    lines.push('import java.util.ArrayList;');
    lines.push('');
  }

  const modifier   = cls.isAbstract ? 'public abstract class' : 'public class';
  const extendsStr = parent ? ` extends ${parent.name}` : '';
  lines.push(`${modifier} ${cls.name}${extendsStr} {`);
  lines.push('');

  // ── Own attribute fields ──────────────────────────────────────────
  if (ownAttrs.length > 0) {
    lines.push('    // Attributes');
    for (const attr of ownAttrs) {
      const field = safeId(attr.name);
      lines.push(`    ${boundsComment(attr)}`);
      if (attr.upperBound !== 1) {
        lines.push(`    private ArrayList<${boxedTypeForAttr(attr, metaModel)}> ${field} = new ArrayList<>();`);
      } else if (hasMetaDefault(attr)) {
        lines.push(`    private ${javaTypeForAttr(attr, metaModel)} ${field} = ${javaLiteralForAttr(attr.defaultValue, attr, metaModel)};`);
      } else if (attr.lowerBound > 0) {
        lines.push(`    private ${javaTypeForAttr(attr, metaModel)} ${field} = ${defaultValueForAttr(attr, metaModel)};`);
      } else {
        lines.push(`    private ${javaTypeForAttr(attr, metaModel)} ${field};`);
      }
    }
    lines.push('');
  }

  // ── Relation fields ───────────────────────────────────────────────
  if (relations.length > 0) {
    lines.push('    // Relations');
    for (const rel of relations) {
      const targetCls = metaModel.classes.find(c => c.id === rel.target);
      if (!targetCls) continue;
      const field = getRelationFieldName(rel, targetCls);
      if (isMultiRelation(rel)) {
        lines.push(`    private ArrayList<${targetCls.name}> ${field} = new ArrayList<>();`);
      } else {
        lines.push(`    private ${targetCls.name} ${field} = null;`);
      }
    }
    lines.push('');
  }

  // ── Default constructor ───────────────────────────────────────────
  lines.push('    // Default constructor');
  lines.push(`    public ${cls.name}() {`);
  if (parent) lines.push('        super();');
  lines.push('    }');
  lines.push('');

  // ── Parameterized constructor ─────────────────────────────────────
  if (allAttrs.length > 0) {
    lines.push('    // Parameterized constructor');
    const params = allAttrs.map(a => {
      if (a.upperBound !== 1) return `ArrayList<${boxedTypeForAttr(a, metaModel)}> ${safeId(a.name)}`;
      return `${javaTypeForAttr(a, metaModel)} ${safeId(a.name)}`;
    }).join(', ');
    lines.push(`    public ${cls.name}(${params}) {`);
    if (parent && parentAttrs.length > 0) {
      lines.push(`        super(${parentAttrs.map(a => safeId(a.name)).join(', ')});`);
    } else if (parent) {
      lines.push('        super();');
    }
    for (const attr of ownAttrs) {
      lines.push(`        this.${safeId(attr.name)} = ${safeId(attr.name)};`);
    }
    lines.push('    }');
    lines.push('');
  }

  // ── Getters and setters for own attributes ────────────────────────
  if (ownAttrs.length > 0) {
    lines.push('    // Getters and setters');
    for (const attr of ownAttrs) {
      const field = safeId(attr.name);
      const cap   = capitalize(field);
      if (attr.upperBound !== 1) {
        const bType = boxedTypeForAttr(attr, metaModel);
        lines.push(`    /** Returns the ${field} list. */`);
        lines.push(`    public ArrayList<${bType}> get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the ${field} list. */`);
        lines.push(`    public void set${cap}(ArrayList<${bType}> ${field}) { this.${field} = ${field}; }`);
        lines.push(`    /** Adds a value to the ${field} list. */`);
        lines.push(`    public void add${cap}(${bType} value) { this.${field}.add(value); }`);
      } else {
        const jType = javaTypeForAttr(attr, metaModel);
        lines.push(`    /** Returns the value of ${field}. */`);
        lines.push(`    public ${jType} get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the value of ${field}. */`);
        lines.push(`    public void set${cap}(${jType} ${field}) { this.${field} = ${field}; }`);
      }
    }
    lines.push('');
  }

  // ── Relation accessors ────────────────────────────────────────────
  if (relations.length > 0) {
    lines.push('    // Relation accessors');
    for (const rel of relations) {
      const targetCls = metaModel.classes.find(c => c.id === rel.target);
      if (!targetCls) continue;
      const field = getRelationFieldName(rel, targetCls);
      const cap   = capitalize(field);
      if (isMultiRelation(rel)) {
        lines.push(`    /** Returns the ${field} relation list. */`);
        lines.push(`    public ArrayList<${targetCls.name}> get${cap}() { return ${field}; }`);
        lines.push(`    /** Adds an item to the ${field} relation. */`);
        lines.push(`    public void add${cap}(${targetCls.name} item) { this.${field}.add(item); }`);
        lines.push(`    /** Sets the ${field} relation list. */`);
        lines.push(`    public void set${cap}(ArrayList<${targetCls.name}> ${field}) { this.${field} = ${field}; }`);
      } else {
        lines.push(`    /** Returns the ${field} relation. */`);
        lines.push(`    public ${targetCls.name} get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the ${field} relation. */`);
        lines.push(`    public void set${cap}(${targetCls.name} ${field}) { this.${field} = ${field}; }`);
      }
    }
    lines.push('');
  }

  // ── toString ──────────────────────────────────────────────────────
  lines.push('    @Override');
  lines.push('    public String toString() {');

  const ownParts = ownAttrs.map(a => {
    const field = safeId(a.name);
    if (a.upperBound !== 1) return `"${field}=" + ${field}`;
    if (a.type === 'STRING')  return `"${field}='" + ${field} + "'"`;
    return `"${field}=" + ${field}`;
  });

  if (parent) {
    const own = ownParts.length > 0 ? ` + ", " + ${ownParts.join(' + ", " + ')}` : '';
    lines.push(`        return "${cls.name}{" + super.toString()${own} + "}";`);
  } else if (cls.isAbstract) {
    lines.push(ownParts.length > 0
      ? `        return ${ownParts.join(' + ", " + ')};`
      : `        return "";`);
  } else {
    lines.push(ownParts.length > 0
      ? `        return "${cls.name}{" + ${ownParts.join(' + ", " + ')} + "}";`
      : `        return "${cls.name}{}";`);
  }

  lines.push('    }');
  lines.push('');

  // ── prettyPrint ───────────────────────────────────────────────────
  lines.push('    public String prettyPrint(int indent) {');
  lines.push('        String pad = "  ".repeat(indent);');
  lines.push('        StringBuilder sb = new StringBuilder();');
  lines.push(`        sb.append(pad).append("${cls.name}:\\n");`);

  // Print inherited attributes via super if there is a parent
  if (parent) {
    lines.push('        sb.append(super.prettyPrint(indent + 1));');
  }

  for (const attr of ownAttrs) {
    const field = safeId(attr.name);
    lines.push(`        sb.append(pad).append("  ${field}: ").append(${field}).append("\\n");`);
  }

  for (const rel of relations) {
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) continue;
    const field = getRelationFieldName(rel, targetCls);
    if (isMultiRelation(rel)) {
      lines.push(`        sb.append(pad).append("  ${field}:\\n");`);
      lines.push(`        for (${targetCls.name} item : ${field}) { sb.append(item.prettyPrint(indent + 2)); }`);
    } else {
      lines.push(`        if (${field} != null) { sb.append(pad).append("  ${field}:\\n").append(${field}.prettyPrint(indent + 2)); }`);
    }
  }

  lines.push('        return sb.toString();');
  lines.push('    }');
  lines.push('');
  lines.push('    public String prettyPrint() { return prettyPrint(0); }');

  // ── Capsule additions (ports, wiring, state machine) ───────────────
  if (scope !== 'structural' && isCapsuleClass(cls)) {
    lines.push('');
    lines.push(...generateCapsuleBody(cls, metaModel));
  }

  lines.push('}');

  return lines.join('\n');
}

// ── Instance model file generator ────────────────────────────────────────────

// Assigns each object a unique, safe local-variable name.
function buildVarNames(im, metaModel) {
  const varNames     = new Map();
  const usedVarNames = new Set();
  for (const obj of im.objects) {
    const objCls = metaModel.classes.find(c => c.id === obj.classId);
    let base    = safeId(obj.name || objCls?.name);
    let varName = base;
    let counter = 2;
    while (usedVarNames.has(varName)) varName = base + counter++;
    usedVarNames.add(varName);
    varNames.set(obj.id, varName);
  }
  return varNames;
}

function instantiationLines(im, metaModel, varNames, ctorArgFor) {
  if (im.objects.length === 0) return [];
  const lines = ['        // Instantiate objects'];
  for (const obj of im.objects) {
    const objCls       = metaModel.classes.find(c => c.id === obj.classId);
    const objClassName = objCls?.name ?? obj.classId;
    const args          = ctorArgFor ? ctorArgFor(objCls) : '';
    lines.push(`        ${objClassName} ${varNames.get(obj.id)} = new ${objClassName}(${args});`);
  }
  lines.push('');
  return lines;
}

// Optional attributes (lowerBound=0) with no value are left uninitialized (no setter call).
// Required attributes (lowerBound>0) with no value fall back to the type default.
function attributeSetLines(im, metaModel, varNames) {
  const attrLines = [];
  for (const obj of im.objects) {
    const allAttrs = getAllAttributes(obj.classId, metaModel);
    const varName  = varNames.get(obj.id);
    for (const attr of allAttrs) {
      const rawVal = obj.attributeValues?.[attr.id];
      const cap    = capitalize(safeId(attr.name));
      if (Array.isArray(rawVal)) {
        const nonEmpty = rawVal.filter(v => v && String(v).trim());
        if (nonEmpty.length > 0) {
          for (const val of nonEmpty) {
            attrLines.push(`        ${varName}.add${cap}(${javaLiteralForAttr(val, attr, metaModel)});`);
          }
        } else if (attr.lowerBound > 0) {
          attrLines.push(`        ${varName}.add${cap}(${defaultValueForAttr(attr, metaModel)});`);
        }
      } else {
        const val = rawVal ? String(rawVal).trim() : '';
        if (val) {
          attrLines.push(`        ${varName}.set${cap}(${javaLiteralForAttr(val, attr, metaModel)});`);
        } else if (hasMetaDefault(attr)) {
          attrLines.push(`        ${varName}.set${cap}(${javaLiteralForAttr(attr.defaultValue, attr, metaModel)});`);
        } else if (attr.lowerBound > 0) {
          attrLines.push(`        ${varName}.set${cap}(${defaultValueForAttr(attr, metaModel)});`);
        }
      }
    }
  }
  return attrLines.length > 0 ? ['        // Set attribute values', ...attrLines, ''] : [];
}

function relationWireLines(im, metaModel, varNames) {
  const relLines = [];
  for (const link of im.links) {
    const rel       = metaModel.relations.find(r => r.id === link.relationId);
    if (!rel) continue;
    const srcVar    = varNames.get(link.source);
    const tgtVar    = varNames.get(link.target);
    if (!srcVar || !tgtVar) continue;
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) continue;
    const field = getRelationFieldName(rel, targetCls);
    const cap   = capitalize(field);
    if (isMultiRelation(rel)) {
      relLines.push(`        ${srcVar}.add${cap}(${tgtVar});`);
    } else {
      relLines.push(`        ${srcVar}.set${cap}(${tgtVar});`);
    }
  }
  return relLines.length > 0 ? ['        // Set relations', ...relLines, ''] : [];
}

function printLines(im, varNames) {
  if (im.objects.length === 0) return [];
  const lines = ['        // Print object states'];
  for (const obj of im.objects) {
    lines.push(`        System.out.println(${varNames.get(obj.id)});`);
  }
  lines.push('');
  return lines;
}

// Print relation summary — generated from the model, not a runtime traversal.
function relationSummaryLines(im, metaModel, varNames) {
  if (im.links.length === 0) return [];
  const lines = ['        // Print relation summary', '        System.out.println("\\nRelations:");'];
  for (const link of im.links) {
    const rel    = metaModel.relations.find(r => r.id === link.relationId);
    if (!rel) continue;
    const srcVar = varNames.get(link.source);
    const tgtVar = varNames.get(link.target);
    if (!srcVar || !tgtVar) continue;
    const label  = rel.name && rel.name.trim() ? rel.name : rel.kind.toLowerCase();
    lines.push(`        System.out.println("  " + "${srcVar}" + "  --[${label}]-->  " + "${tgtVar}");`);
  }
  lines.push('');
  return lines;
}

// A connector links exactly one pair of (base, conjugate) ports, and — since
// each port can appear in at most one connector — must wire BOTH directions
// of that pair (source's peer = target's receiver, and vice versa), not just
// source->target. Otherwise a port that only ever *sends* signals defined on
// its complementary port (like the seed's oppositeOut) would be left null.
function connectorWireLines(im, metaModel, varNames) {
  const connectors = im.connectors ?? [];
  if (connectors.length === 0) return [];
  const lines = ['        // Wire capsule connectors'];
  for (const conn of connectors) {
    const srcVar = varNames.get(conn.sourceObjectId);
    const tgtVar = varNames.get(conn.targetObjectId);
    if (!srcVar || !tgtVar) continue;
    const srcObj = im.objects.find((o) => o.id === conn.sourceObjectId);
    const tgtObj = im.objects.find((o) => o.id === conn.targetObjectId);
    const srcCls = metaModel.classes.find((c) => c.id === srcObj?.classId);
    const tgtCls = metaModel.classes.find((c) => c.id === tgtObj?.classId);
    const srcPort = (srcCls?.ports ?? []).find((p) => p.id === conn.sourcePortId);
    const tgtPort = (tgtCls?.ports ?? []).find((p) => p.id === conn.targetPortId);
    if (!srcPort || !tgtPort) continue;
    const srcCap = capitalize(portFieldName(srcPort));
    const tgtCap = capitalize(portFieldName(tgtPort));
    lines.push(`        ${srcVar}.connect${srcCap}(${tgtVar}.get${tgtCap}Receiver());`);
    lines.push(`        ${tgtVar}.connect${tgtCap}(${srcVar}.get${srcCap}Receiver());`);
  }
  lines.push('');
  return lines;
}

function startLines(im, metaModel, varNames) {
  const starters = im.objects.filter((obj) => {
    const cls = metaModel.classes.find((c) => c.id === obj.classId);
    return cls && hasStateMachine(cls, metaModel);
  });
  if (starters.length === 0) return [];
  const lines = ['        // Start capsules'];
  for (const obj of starters) lines.push(`        ${varNames.get(obj.id)}.start();`);
  lines.push('');
  return lines;
}

function usesTimingPort(im, metaModel) {
  return im.objects.some((obj) => {
    const cls = metaModel.classes.find((c) => c.id === obj.classId);
    return (cls?.ports ?? []).some((p) => p.protocolId === 'sys-timing');
  });
}

function ctorArgsForCapsule(cls) {
  return (cls?.ports ?? []).some((p) => p.protocolId === 'sys-timing') ? 'scheduler' : '';
}

// Structural-only main(): construct, set attributes, wire relation links,
// print structural state — exactly today's (pre-behavioural) output.
function generateInstanceFile(im, metaModel, pkg) {
  const className = toClassName(im.name);
  const varNames  = buildVarNames(im, metaModel);

  const lines = [
    `package ${pkg};`, '',
    `public class ${className} {`, '',
    '    public static void main(String[] args) {', '',
    ...instantiationLines(im, metaModel, varNames),
    ...attributeSetLines(im, metaModel, varNames),
    ...relationWireLines(im, metaModel, varNames),
    ...printLines(im, varNames),
    ...relationSummaryLines(im, metaModel, varNames),
    '    }',
    '}',
  ];
  return lines.join('\n');
}

// Behavioural/all-code main(): construct (capsules needing a Timing port take
// the Scheduler), set attributes, optionally wire relation links + print
// (scope 'all' only), wire capsule connectors, start() every capsule, then
// run the shared event loop. The structural print happens BEFORE start()
// since run() blocks forever for a cyclic model — it must capture the
// initial state, not dead code after an infinite loop.
function generateMainFile(im, metaModel, pkg, scope) {
  const className   = toClassName(im.name);
  const varNames    = buildVarNames(im, metaModel);
  const needsRunLoop = usesTimingPort(im, metaModel);

  const lines = [`package ${pkg};`, '', `public class ${className} {`, '', '    public static void main(String[] args) {', ''];
  if (needsRunLoop) {
    lines.push('        Scheduler scheduler = new Scheduler();');
    lines.push('');
  }
  lines.push(...instantiationLines(im, metaModel, varNames, ctorArgsForCapsule));
  lines.push(...attributeSetLines(im, metaModel, varNames));
  if (scope === 'all') lines.push(...relationWireLines(im, metaModel, varNames));
  lines.push(...connectorWireLines(im, metaModel, varNames));
  if (scope === 'all') {
    lines.push(...printLines(im, varNames));
    lines.push(...relationSummaryLines(im, metaModel, varNames));
  }
  lines.push(...startLines(im, metaModel, varNames));
  if (needsRunLoop) lines.push('        scheduler.run();');
  lines.push('    }', '}');
  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

// scope: 'structural' (default, today's output) | 'behavioural' | 'all' — see
// the Module 3 codegen design notes for the full three-scope spec.
export function generateJavaCode(metaModel, instanceModels, scope = 'structural') {
  const pkgName = `iml.${toPackageName(metaModel.name)}`;
  const pkgDir  = `iml/${toPackageName(metaModel.name)}`;

  const files = [];

  for (const en of metaModel.enumerations ?? []) {
    files.push({
      path:    `${pkgDir}/${toClassName(en.name)}.java`,
      content: generateEnumFile(en, pkgName),
    });
  }

  if (scope !== 'structural') {
    const usedProtocolIds = new Set();
    let usesTiming = false;
    let usesLog    = false;
    for (const cls of metaModel.classes) {
      for (const port of cls.ports ?? []) {
        if (port.protocolId === 'sys-timing') usesTiming = true;
        else if (port.protocolId === 'sys-log') usesLog = true;
        else usedProtocolIds.add(port.protocolId);
      }
    }
    for (const protoId of usedProtocolIds) {
      const proto = getProtocolById(protoId, metaModel);
      if (!proto) continue;
      files.push({
        path:    `${pkgDir}/${toClassName(proto.name)}Receiver.java`,
        content: generateProtocolReceiverInterface(proto, pkgName),
      });
    }
    if (usesTiming) {
      files.push({ path: `${pkgDir}/Scheduler.java`,   content: generateSchedulerFile(pkgName) });
      files.push({ path: `${pkgDir}/TimingPort.java`,  content: generateTimingPortFile(pkgName) });
    }
    if (usesLog) {
      files.push({ path: `${pkgDir}/LogPort.java`, content: generateLogPortFile(pkgName) });
    }
  }

  for (const cls of metaModel.classes) {
    files.push({
      path:    `${pkgDir}/${cls.name}.java`,
      content: generateClassFile(cls, metaModel, pkgName, scope),
    });
  }

  for (const im of instanceModels) {
    files.push({
      path:    `${pkgDir}/${toClassName(im.name)}.java`,
      content: scope === 'structural'
        ? generateInstanceFile(im, metaModel, pkgName)
        : generateMainFile(im, metaModel, pkgName, scope),
    });
  }

  return files;
}
