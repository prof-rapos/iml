// Best-effort interpreter for the tiny subset of Java action-code (entry/exit/
// effect strings) the symbolic execution engine can track exactly: literal
// assignments and strictly self-referential arithmetic on a capsule
// attribute. Anything else touching a tracked attribute degrades that
// attribute to "unknown" for the rest of the path — subsumption still works
// on whatever remains known, this is graceful degradation, not a failure.
// Lines that don't touch a tracked attribute at all (port sends, log calls)
// are no-ops here.

const IDENT = '[A-Za-z_$][\\w$]*';
const NUM   = '-?\\d+(?:\\.\\d+)?';

const RE_SELF_ARITH = new RegExp(`^(${IDENT})\\s*=\\s*\\1\\s*([+\\-*/])\\s*(${NUM})$`);
const RE_COMPOUND   = new RegExp(`^(${IDENT})\\s*(\\+=|-=|\\*=|/=)\\s*(${NUM})$`);
const RE_INCR_DECR  = new RegExp(`^(${IDENT})\\s*(\\+\\+|--)$`);
const RE_ASSIGN     = new RegExp(`^(${IDENT})\\s*=\\s*(.+)$`);

const RE_BOOL   = /^(true|false)$/;
const RE_NUMLIT = /^-?\d+(?:\.\d+)?$/;
const RE_STRLIT = /^"((?:[^"\\]|\\.)*)"$/;
const RE_ENUMLIT = /^[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)$/;

function arithResult(ident, op, numStr, attrIndex, values) {
  const attr = attrIndex.get(ident);
  if (!attr) return null; // not a tracked attribute — no-op
  const cur = values.get(attr.id);
  if (!cur || cur.kind !== 'known' || isNaN(Number(cur.value))) {
    return { attrId: attr.id, value: { kind: 'unknown' } };
  }
  const base  = Number(cur.value);
  const delta = Number(numStr);
  let result;
  switch (op) {
    case '+': result = base + delta; break;
    case '-': result = base - delta; break;
    case '*': result = base * delta; break;
    case '/': result = base / delta; break;
    default:  return { attrId: attr.id, value: { kind: 'unknown' } };
  }
  return { attrId: attr.id, value: { kind: 'known', value: String(result) } };
}

// Returns the literal's string form (matching how attribute values are
// stored elsewhere in the model — plain strings, enum values as bare literal
// names) or undefined if rhs isn't a recognized literal for attr's type.
function parseLiteral(rhs, attr) {
  if (RE_BOOL.test(rhs))   return rhs;
  if (RE_NUMLIT.test(rhs)) return rhs;
  const str = rhs.match(RE_STRLIT);
  if (str) return str[1].replace(/\\(.)/g, '$1');
  const en = rhs.match(RE_ENUMLIT);
  if (en && attr.type === 'ENUM') return en[1];
  return undefined;
}

// attrIndex: Map<safeId(attr.name), attr>. values: Map<attrId, {kind:'known',value}|{kind:'unknown'}>.
// Returns {attrId, value} for a recognized assignment to a tracked attribute, or null if
// the line doesn't touch one (either not an assignment, or assigns to an untracked identifier).
export function parseActionLine(line, attrIndex, values) {
  let m = line.match(RE_SELF_ARITH);
  if (m) return arithResult(m[1], m[2], m[3], attrIndex, values);

  m = line.match(RE_COMPOUND);
  if (m) return arithResult(m[1], m[2][0], m[3], attrIndex, values);

  m = line.match(RE_INCR_DECR);
  if (m) return arithResult(m[1], m[2][0], '1', attrIndex, values);

  m = line.match(RE_ASSIGN);
  if (m) {
    const attr = attrIndex.get(m[1]);
    if (!attr) return null;
    const literal = parseLiteral(m[2].trim(), attr);
    return {
      attrId: attr.id,
      value: literal !== undefined ? { kind: 'known', value: literal } : { kind: 'unknown' },
    };
  }

  return null;
}

// Applies a (possibly multi-line, possibly empty) action-code string to a
// values map, returning a new map. Lines are processed in order, tracking
// brace depth: a line's own assignment pattern is only ever recognized as
// UNCONDITIONAL (and its computed value applied) when that line sits at
// depth 0. A recognized pattern found at depth > 0 (inside an if/while/for/
// switch/etc. block — anything brace-delimited) is control-flow this
// interpreter deliberately never evaluates (same "opaque, never solved"
// treatment as a transition guard), so the attribute it touches becomes
// unknown instead of silently applying a value that may not actually run.
// Without this, e.g. a bare `count++;` one indent inside `if (count < 10) {`
// would otherwise be read as unconditional, since each line is matched in
// isolation — that under-counts nothing but over-applies everything.
// (A brace-less single-statement body, e.g. `if (x)\n  count++;` with no
// `{`, isn't caught by this — a known, accepted gap; the seed/example models
// so far always brace their blocks.)
export function applyActionCode(code, attrIndex, values) {
  if (!code || !code.trim()) return values;
  let next = values;
  let depth = 0;
  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim().replace(/;\s*$/, '').trim();
    if (!line) continue;

    const startDepth = depth;
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);

    const result = parseActionLine(line, attrIndex, next);
    if (result) {
      const value = startDepth > 0 ? { kind: 'unknown' } : result.value;
      next = new Map(next);
      next.set(result.attrId, value);
    }
  }
  return next;
}
