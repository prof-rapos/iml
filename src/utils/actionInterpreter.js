// Best-effort interpreter for the tiny subset of Java action-code (entry/exit/
// effect strings) the symbolic execution engine can track exactly: literal
// assignments, strictly self-referential arithmetic, and `if`/`if-else`
// blocks whose condition is a simple comparison (or boolean check) against a
// tracked attribute with a KNOWN value — that's evaluable exactly, unlike a
// transition guard (which can reference anything), so it's fair game even
// though transition guards themselves are still never solved. Anything else
// touching a tracked attribute — a condition we can't evaluate, a value we
// don't have, a shape of code we don't recognize — degrades that attribute
// to "unknown" rather than guessing. Subsumption still works on whatever
// remains known; this is graceful degradation, not a failure.

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

const RE_IF   = new RegExp(`^if\\s*\\((.*)\\)\\s*\\{$`);
const RE_ELSE = /^\}\s*else\s*\{$/;
const RE_CLOSE = /^\}$/;

const RE_COMPARISON = new RegExp(`^(${IDENT})\\s*(<=|>=|==|!=|<|>)\\s*(${NUM}|true|false)$`);
const RE_BOOL_NOT    = new RegExp(`^!\\s*(${IDENT})$`);
const RE_BOOL_IDENT  = new RegExp(`^(${IDENT})$`);

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

// true | false | 'unknown'. Only ever evaluates a single tracked attribute
// against a literal (or a bare/negated boolean attribute) — deliberately not
// attr-vs-attr or anything more elaborate, matching the same
// simple/self-contained philosophy as the arithmetic support above.
function evaluateCondition(condRaw, attrIndex, values) {
  const cond = condRaw.trim();

  let m = cond.match(RE_COMPARISON);
  if (m) {
    const attr = attrIndex.get(m[1]);
    const cur = attr && values.get(attr.id);
    if (!cur || cur.kind !== 'known') return 'unknown';
    const [, , op, rhsRaw] = m;
    if (rhsRaw === 'true' || rhsRaw === 'false') {
      if (op !== '==' && op !== '!=') return 'unknown';
      const lhsBool = cur.value === 'true';
      const rhsBool = rhsRaw === 'true';
      return op === '==' ? lhsBool === rhsBool : lhsBool !== rhsBool;
    }
    const lhs = Number(cur.value);
    const rhs = Number(rhsRaw);
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return 'unknown';
    switch (op) {
      case '<':  return lhs < rhs;
      case '<=': return lhs <= rhs;
      case '>':  return lhs > rhs;
      case '>=': return lhs >= rhs;
      case '==': return lhs === rhs;
      case '!=': return lhs !== rhs;
      default:   return 'unknown';
    }
  }

  m = cond.match(RE_BOOL_NOT);
  if (m) {
    const attr = attrIndex.get(m[1]);
    const cur = attr && values.get(attr.id);
    if (!cur || cur.kind !== 'known') return 'unknown';
    return cur.value !== 'true';
  }

  m = cond.match(RE_BOOL_IDENT);
  if (m) {
    const attr = attrIndex.get(m[1]);
    const cur = attr && values.get(attr.id);
    if (!cur || cur.kind !== 'known') return 'unknown';
    return cur.value === 'true';
  }

  return 'unknown';
}

// Classifies one trimmed, semicolon-stripped line for the block parser.
// Only an `if (...) {` / lone `}` / single-line `} else {` are recognized
// as structural — anything else brace-adjacent (else-if chains, brace-less
// single-statement bodies, a same-line `if (x) { y; }`) is reported so the
// caller can fall back to the simpler, safe flat interpreter instead of
// risking a structural mis-parse.
function classifyLine(line) {
  const ifMatch = line.match(RE_IF);
  if (ifMatch) return { type: 'if', cond: ifMatch[1] };
  if (RE_ELSE.test(line)) return { type: 'else' };
  if (RE_CLOSE.test(line)) return { type: 'close' };
  if (line.includes('{') || line.includes('}')) return { type: 'unsupported' };
  return { type: 'stmt', text: line };
}

// Parses tokens[i..] into a statement list, stopping (without consuming) at
// a close/else token or the end of the array.
function parseBlock(tokens, i) {
  const stmts = [];
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'close' || t.type === 'else') break;
    if (t.type === 'if') {
      const thenResult = parseBlock(tokens, i + 1);
      i = thenResult.next;
      let elseStmts = null;
      if (tokens[i]?.type === 'else') {
        const elseResult = parseBlock(tokens, i + 1);
        elseStmts = elseResult.stmts;
        i = elseResult.next;
      }
      if (tokens[i]?.type === 'close') i++;
      stmts.push({ kind: 'if', cond: t.cond, then: thenResult.stmts, else: elseStmts });
      continue;
    }
    stmts.push({ kind: 'line', text: t.text });
    i++;
  }
  return { stmts, next: i };
}

// Recursively collects the attrIds any line in this statement list (through
// nested ifs) would assign to, regardless of value — used when a condition
// can't be evaluated, to mark every attribute either branch *might* have
// touched as unknown without guessing which branch (if either) ran.
function collectAssignedAttrs(stmts, attrIndex, out) {
  for (const stmt of stmts) {
    if (stmt.kind === 'line') {
      const result = parseActionLine(stmt.text, attrIndex, new Map());
      if (result) out.add(result.attrId);
    } else {
      collectAssignedAttrs(stmt.then, attrIndex, out);
      if (stmt.else) collectAssignedAttrs(stmt.else, attrIndex, out);
    }
  }
}

function execStatements(stmts, attrIndex, values) {
  let cur = values;
  for (const stmt of stmts) {
    if (stmt.kind === 'line') {
      const result = parseActionLine(stmt.text, attrIndex, cur);
      if (result) {
        cur = new Map(cur);
        cur.set(result.attrId, result.value);
      }
      continue;
    }

    const cond = evaluateCondition(stmt.cond, attrIndex, cur);
    if (cond === true) {
      cur = execStatements(stmt.then, attrIndex, cur);
    } else if (cond === false) {
      if (stmt.else) cur = execStatements(stmt.else, attrIndex, cur);
    } else {
      const touched = new Set();
      collectAssignedAttrs(stmt.then, attrIndex, touched);
      if (stmt.else) collectAssignedAttrs(stmt.else, attrIndex, touched);
      if (touched.size) {
        cur = new Map(cur);
        for (const attrId of touched) cur.set(attrId, { kind: 'unknown' });
      }
    }
  }
  return cur;
}

// Fallback for code shapes the structured parser above won't cleanly handle
// (else-if chains, brace-less bodies, etc.) — same depth-tracking behavior
// as before structured if/else support existed: a recognized assignment
// only applies unconditionally at brace depth 0; anything inside any block
// degrades to unknown. Never MISAPPLIES a value — the one residual gap is a
// same-line block (e.g. "if (x) { count++; }" all on one line): the whole
// line doesn't match any single-statement regex as a unit, so it's read as
// a no-op and the attribute is left stale rather than marked unknown. Not
// fixed — this shape hasn't appeared in any real model (multi-line brace
// formatting is universal in practice), and "stale" is a materially smaller
// risk than the misapplied-value bug this whole file exists to avoid.
function applyFlatDegraded(lines, attrIndex, values) {
  let next = values;
  let depth = 0;
  for (const line of lines) {
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

// Applies a (possibly multi-line, possibly empty) action-code string to a
// values map, returning a new map.
export function applyActionCode(code, attrIndex, values) {
  if (!code || !code.trim()) return values;
  const lines = code.split('\n')
    .map((l) => l.trim().replace(/;\s*$/, '').trim())
    .filter((l) => l.length > 0);

  const tokens = lines.map(classifyLine);
  if (tokens.some((t) => t.type === 'unsupported')) {
    return applyFlatDegraded(lines, attrIndex, values);
  }

  const { stmts } = parseBlock(tokens, 0);
  return execStatements(stmts, attrIndex, values);
}
