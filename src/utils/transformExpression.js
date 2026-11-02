// Minimal, safe expression evaluator for transform attribute mappings.
//
// It lets a target attribute be *computed* from source attributes rather than
// only copied. No eval() — a tiny tokeniser + recursive-descent parser.
//
// Grammar:
//   expr       := ternary
//   ternary    := or ('?' ternary ':' ternary)?
//   or         := and ('||' and)*
//   and        := comparison ('&&' comparison)*
//   comparison := arith (('>' | '<' | '>=' | '<=' | '==' | '!=') arith)?
//   arith      := term (('+' | '-') term)*
//   term       := unary (('*' | '/' | '%') unary)*
//   unary      := '-' unary | '!' unary | postfix
//   postfix    := primary ('.' IDENT '(' args? ')')*
//   primary    := number | string | 'true' | 'false' | '{' ref '}' | '(' expr ')'
//               | IDENT '(' args? ')'
//   args       := expr (',' expr)*
//
// - {name}  resolves against `scope` (source attribute name → value).
// - "text" or 'text' is a string literal.
// - Functions can be called two ways that mean exactly the same thing — the
//   function form  substring({s}, 0, 4)  and the Java-style method form
//   {s}.substring(0, 4)  (the receiver simply becomes the first argument).
//   Both are kept on purpose for now (the method form matches the Java the
//   rest of the tool generates; the function form predates it) — revisit
//   whether to keep both once real usage shows which one people reach for.
//   Function names are matched case-insensitively. See FUNCTIONS below.
// - '+' adds when BOTH operands are numbers, otherwise concatenates.
// - '-', '*', '/', '%' are always numeric.
// - comparisons compare numerically when both operands are numeric, otherwise
//   as strings (so e.g. {name} > "M" works).
// - a ternary's condition is truthy per truthy() below when it isn't itself
//   a comparison (e.g. a bare {flag} ? "on" : "off").
// - '!' negates its operand's truthy() value, '&&' / '||' combine two.
//
// TYPED vs UNTYPED. An optional third `types` argument (source attribute name →
// attribute type, as runTransform passes) switches on typed evaluation, where
// a reference's declared type decides how it behaves:
//   BOOLEAN       → a real boolean (counts as 1/0 in arithmetic)
//   INT / DOUBLE  → a real number
//   STRING / ENUM → text, which ALWAYS concatenates under '+' and compares as
//                   text, even if it happens to look numeric ("007", a zip code)
// and a string literal or string-function result is text too. Without `types`
// (the legacy/untyped mode, kept for callers that have no attribute types) every
// value is a plain string and a numeric-looking one is treated as a number.
//
// Examples:
//   {firstName} + " " + {lastName}       →  "Ada Lovelace"
//   {price} * 1.1                        →  numeric
//   ({a} + {b}) / 2                      →  numeric average
//   {x} > 10 ? "large" : "small"
//   {s}.equals("A") ? 1 : 0
//   {code}.substring(0, 4)               →  first four characters
//   {a} > 0 && !{done}                   →  "true" / "false"
//   upper({name})  or  {name}.upper()    →  "ADA"
//   round({price} * 1.15, 2)             →  numeric, 2 decimal places
//   {status}.match("A", "Active", "I", "Inactive", "Unknown")

// True when a value can participate in arithmetic (a number, or a numeric string).
export function isNumericValue(v) {
  if (typeof v === 'number') return isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v));
}

// Render a JS number back to a string, trimming floating-point noise.
function formatNumber(n) {
  if (!isFinite(n)) return '';
  return String(parseFloat(n.toPrecision(12)));
}

function strify(v) {
  return typeof v === 'number' ? formatNumber(v) : String(v ?? '');
}

// Truthiness for a ternary condition that isn't itself a comparison (e.g. a
// bare {flag} used directly) — mirrors how a BOOLEAN attribute's value is
// actually represented elsewhere in this codebase (the strings "true"/
// "false"), so {active} ? ... : ... reads naturally without needing
// {active} == "true".
function truthy(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  const s = String(v ?? '').trim();
  return s !== '' && s !== '0' && s.toLowerCase() !== 'false';
}

// ── Functions ─────────────────────────────────────────────────────────────────
// Each takes its arguments as raw intermediate values (number / boolean / string,
// same as the operators) rather than pre-stringified ones, so e.g.
// round({price} * 1.15) sees the actual number. The FIRST argument is the
// "receiver" when called as {s}.name(...). Out-of-range indices are clamped
// rather than throwing (unlike Java) so one short value in a big model doesn't
// raise a warning per object.
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const toIndex = (v, fallback) => {
  const n = Math.trunc(Number(v));
  return Number.isNaN(n) ? fallback : n;
};
const def = (min, max, run) => ({ min, max, run });

const FUNCTIONS = {
  // text
  upper:            def(1, 1, (s) => strify(s).toUpperCase()),
  lower:            def(1, 1, (s) => strify(s).toLowerCase()),
  trim:             def(1, 1, (s) => strify(s).trim()),
  len:              def(1, 1, (s) => strify(s).length),
  substring:        def(2, 3, (s, begin, end) => {
    const t = strify(s);
    const from = clamp(toIndex(begin, 0), 0, t.length);
    const to = end === undefined ? t.length : clamp(toIndex(end, t.length), 0, t.length);
    return from <= to ? t.slice(from, to) : '';
  }),
  charAt:           def(2, 2, (s, i) => strify(s).charAt(toIndex(i, 0))),
  indexOf:          def(2, 3, (s, t, from) => strify(s).indexOf(strify(t), from === undefined ? 0 : Math.max(0, toIndex(from, 0)))),
  contains:         def(2, 2, (s, t) => strify(s).includes(strify(t))),
  startsWith:       def(2, 2, (s, t) => strify(s).startsWith(strify(t))),
  endsWith:         def(2, 2, (s, t) => strify(s).endsWith(strify(t))),
  equals:           def(2, 2, (a, b) => strify(a) === strify(b)),
  equalsIgnoreCase: def(2, 2, (a, b) => strify(a).toLowerCase() === strify(b).toLowerCase()),
  isEmpty:          def(1, 1, (s) => strify(s) === ''),
  isBlank:          def(1, 1, (s) => strify(s).trim() === ''),
  // Replaces every occurrence of a literal substring (like Java's String.replace).
  replace:          def(3, 3, (s, t, r) => (strify(t) === '' ? strify(s) : strify(s).split(strify(t)).join(strify(r)))),
  // numeric
  round:            def(1, 2, (v, places) => {
    const f = 10 ** clamp(toIndex(places, 0), 0, 12);
    return Math.round(Number(v) * f) / f;
  }),
  abs:              def(1, 1, (v) => Math.abs(Number(v))),
  floor:            def(1, 1, (v) => Math.floor(Number(v))),
  ceil:             def(1, 1, (v) => Math.ceil(Number(v))),
  min:              def(2, Infinity, (...a) => Math.min(...a.map(Number))),
  max:              def(2, Infinity, (...a) => Math.max(...a.map(Number))),
  // general
  // First argument that isn't empty, else ''.
  coalesce:         def(1, Infinity, (...a) => a.find((v) => strify(v) !== '') ?? ''),
  // {v}.match(k1, r1, k2, r2, ..., [default]) — a lookup table, e.g. for
  // remapping enum literals. Returns the result paired with the first key equal
  // to v; otherwise the trailing default if one was given, else v unchanged.
  match:            def(1, Infinity, (v, ...rest) => {
    for (let i = 0; i + 1 < rest.length; i += 2) {
      if (strify(rest[i]) === strify(v)) return rest[i + 1];
    }
    return rest.length % 2 === 1 ? rest[rest.length - 1] : v;
  }),
};

// Java-flavoured aliases for the names above.
const ALIASES = { touppercase: 'upper', tolowercase: 'lower', length: 'len' };

const FUNCTION_LOOKUP = new Map(Object.entries(FUNCTIONS).map(([name, f]) => [name.toLowerCase(), f]));
const lookupFunction = (name) => {
  const key = name.toLowerCase();
  return FUNCTION_LOOKUP.get(ALIASES[key] ?? key);
};

function describeArity(f, isMethod) {
  // For the method form the receiver isn't something the user types in the parens.
  const lo = f.min - (isMethod ? 1 : 0);
  const hi = f.max === Infinity ? Infinity : f.max - (isMethod ? 1 : 0);
  if (hi === Infinity) return `at least ${lo} argument${lo === 1 ? '' : 's'}`;
  if (lo === hi) return `${lo} argument${lo === 1 ? '' : 's'}`;
  return `${lo} to ${hi} arguments`;
}

function callFunction(name, args, isMethod) {
  const f = lookupFunction(name);
  if (!f) throw new Error(isMethod ? `Unknown method ".${name}()"` : `Unknown function "${name}"`);
  if (args.length < f.min || args.length > f.max) {
    throw new Error(`${name}() takes ${describeArity(f, isMethod)}`);
  }
  return f.run(...args);
}

function resolveRef(scope, name, types) {
  const v = scope[name];
  if (v === undefined) return '';                       // unknown ref → empty
  if (Array.isArray(v)) return v.filter((x) => String(x).trim() !== '').join(' ');
  const type = types?.[name];
  if (type === 'BOOLEAN') {
    // Same truth rule convertSingle uses for STRING→BOOLEAN; unset reads as false.
    return typeof v === 'boolean' ? v : (String(v).trim() === 'true' || String(v).trim() === '1');
  }
  if (type === 'INT' || type === 'DOUBLE') return isNumericValue(v) ? Number(v) : (v ?? '');
  return v ?? '';
}

function tokenize(input) {
  const s = String(input ?? '');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '{') {
      const end = s.indexOf('}', i);
      if (end === -1) throw new Error('Unclosed "{" in expression');
      tokens.push({ t: 'ref', v: s.slice(i + 1, end).trim() });
      i = end + 1; continue;
    }
    if (c === '"' || c === "'") {
      const end = s.indexOf(c, i + 1);
      if (end === -1) throw new Error('Unclosed string literal in expression');
      tokens.push({ t: 'str', v: s.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (c === '?' || c === ':' || c === ',') { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '&' || c === '|') {
      if (s[i + 1] !== c) throw new Error(`Unexpected character "${c}" in expression (did you mean "${c}${c}"?)`);
      tokens.push({ t: 'op', v: c + c }); i += 2; continue;
    }
    if ('<>=!'.includes(c)) {
      const two = s.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
        tokens.push({ t: 'op', v: two }); i += 2; continue;
      }
      if (c === '>' || c === '<' || c === '!') { tokens.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`Unexpected character "${c}" in expression`);
    }
    if ('+-*/%()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
    // A '.' that isn't part of a number starts a method call: {s}.upper()
    if (c === '.') { tokens.push({ t: 'op', v: '.' }); i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ t: 'ident', v: s.slice(i, j) });
      i = j; continue;
    }
    throw new Error(`Unexpected character "${c}" in expression`);
  }
  return tokens;
}

// Evaluate an expression against a scope. Returns a string (the rendered value).
// `types` (optional) turns on typed evaluation — see the header comment.
// Throws on malformed input — callers should catch and fall back.
export function evalExpression(input, scope = {}, types = null) {
  const tokens = tokenize(input);
  const typed = types != null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  // Matches an operator token only — a string literal whose text happens to be
  // ")" or ":" must never be mistaken for punctuation.
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

  const COMPARISON_OPS = ['>', '<', '>=', '<=', '==', '!='];

  // A number or boolean takes part in arithmetic; in untyped mode so does a
  // numeric-looking string.
  const numeric = (v) =>
    (typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || (!typed && isNumericValue(v));

  function add(a, b) {
    if (numeric(a) && numeric(b)) return Number(a) + Number(b);
    return strify(a) + strify(b);
  }

  // Numeric compare when both sides are numeric, else lexicographic string
  // compare (so a name/text comparison like {status} == "done" or
  // {name} > "M" is meaningful, not just always-false).
  function compare(a, b, op) {
    let cmp;
    const bothBool = typeof a === 'boolean' && typeof b === 'boolean';
    // Typed text vs text is always a string compare, even if both look numeric
    // ("007" != "7"); a number or boolean on either side compares numerically
    // when the other side parses as one.
    const bothText = typed && typeof a === 'string' && typeof b === 'string';
    const looksNumeric = (v) => typeof v === 'boolean' || isNumericValue(v);
    if (!bothBool && !bothText && looksNumeric(a) && looksNumeric(b)) {
      const na = Number(a), nb = Number(b);
      cmp = na < nb ? -1 : na > nb ? 1 : 0;
    } else {
      const sa = strify(a), sb = strify(b);
      cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    switch (op) {
      case '>':  return cmp > 0;
      case '<':  return cmp < 0;
      case '>=': return cmp >= 0;
      case '<=': return cmp <= 0;
      case '==': return cmp === 0;
      case '!=': return cmp !== 0;
      default:   return false;
    }
  }

  function parseTernary() {
    const cond = parseOr();
    if (isOp('?')) {
      next();
      const thenVal = parseTernary();
      if (!isOp(':')) throw new Error('Expected ":" in ternary expression');
      next();
      const elseVal = parseTernary();
      return truthy(cond) ? thenVal : elseVal;
    }
    return cond;
  }

  function parseOr() {
    let left = parseAnd();
    while (isOp('||')) {
      next();
      const right = parseAnd();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  function parseAnd() {
    let left = parseComparison();
    while (isOp('&&')) {
      next();
      const right = parseComparison();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  function parseComparison() {
    const left = parseArith();
    if (peek() && peek().t === 'op' && COMPARISON_OPS.includes(peek().v)) {
      const op = next().v;
      const right = parseArith();
      return compare(left, right, op);
    }
    return left;
  }

  function parseArith() {
    let left = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = next().v;
      const right = parseTerm();
      left = op === '+' ? add(left, right) : (Number(left) - Number(right));
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = next().v;
      const right = parseUnary();
      left = op === '*' ? (Number(left) * Number(right))
        : op === '/' ? (Number(left) / Number(right))
        : (Number(left) % Number(right));
    }
    return left;
  }

  function parseUnary() {
    if (isOp('-')) { next(); return -Number(parseUnary()); }
    if (isOp('!')) { next(); return !truthy(parseUnary()); }
    return parsePostfix();
  }

  // primary followed by any number of .method(args) calls: {s}.trim().upper()
  function parsePostfix() {
    let v = parsePrimary();
    while (isOp('.')) {
      next();
      const id = next();
      if (!id || id.t !== 'ident') throw new Error('Expected a method name after "."');
      v = callFunction(id.v, [v, ...parseArgs(id.v)], true);
    }
    return v;
  }

  // Parses "( [expr {, expr}] )" and returns the argument values.
  function parseArgs(name) {
    if (!isOp('(')) throw new Error(`Expected "(" after "${name}"`);
    next();
    const args = [];
    if (isOp(')')) { next(); return args; }
    for (;;) {
      args.push(parseTernary());
      if (isOp(',')) { next(); continue; }
      if (!isOp(')')) throw new Error(`Missing ")" after ${name}(...)`);
      next();
      return args;
    }
  }

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('Unexpected end of expression');
    if (isOp('(')) {
      next();
      const v = parseTernary();
      if (!isOp(')')) throw new Error('Missing ")"');
      next();
      return v;
    }
    if (tk.t === 'num') { next(); return tk.v; }
    if (tk.t === 'str') { next(); return tk.v; }
    if (tk.t === 'ref') { next(); return resolveRef(scope, tk.v, types); }
    if (tk.t === 'ident') {
      next();
      const lower = tk.v.toLowerCase();
      if (!isOp('(')) {
        if (lower === 'true') return true;
        if (lower === 'false') return false;
        throw new Error(lookupFunction(tk.v)
          ? `Expected "(" after "${tk.v}"`
          : `Unknown name "${tk.v}" — attribute references need braces, e.g. {${tk.v}}`);
      }
      return callFunction(tk.v, parseArgs(tk.v), false);
    }
    throw new Error(`Unexpected token "${tk.v}"`);
  }

  if (tokens.length === 0) return '';
  const result = parseTernary();
  if (pos < tokens.length) throw new Error('Unexpected trailing input in expression');
  return strify(result);
}
