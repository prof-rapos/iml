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
// - Functions come in two kinds, each with exactly one spelling, Java-style:
//     methods   — done to a value:   {s}.toUpperCase(), {s}.substring(0, 4)
//     functions — computed from args: round({x}, 2), max(a, b), coalesce(a, b)
//   Names are matched case-insensitively. See FUNCTIONS below. (Earlier
//   versions also accepted upper(x) / len(x) / substring(x, 0, 4); that
//   duplicate spelling was dropped — the error message names the replacement.)
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
//   {name}.toUpperCase()                 →  "ADA"
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
// Two kinds, each with exactly ONE spelling (Java style):
//   method    — something done TO a value, called on it:  {s}.substring(0, 4)
//   function  — computes from the arguments given:        round({x}, 2), max(a, b)
// A method's implementation receives the value it is called on as its FIRST
// argument. Arguments are raw intermediate values (number / boolean / string,
// same as the operators) rather than pre-stringified ones, so e.g.
// round({price} * 1.15) sees the actual number. Out-of-range indices are
// clamped rather than throwing (unlike Java) so one short value in a big model
// doesn't raise a warning per object.
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const toIndex = (v, fallback) => {
  const n = Math.trunc(Number(v));
  return Number.isNaN(n) ? fallback : n;
};

// `min`/`max` are the argument counts as the user types them (a method's
// receiver is not counted). `doc` feeds the rule editor's reference panel
// (FUNCTION_REFERENCE below): [group, signature, description, example]; a "?"
// after a parameter marks it optional.
const method = (min, max, run, doc) => ({ kind: 'method', min, max, run, doc });
const func = (min, max, run, doc) => ({ kind: 'function', min, max, run, doc });

const TEXT = 'Text methods', NUMBER = 'Number functions', GENERAL = 'General';

const FUNCTIONS = {
  // text — methods, named as in Java
  toUpperCase:      method(0, 0, (s) => strify(s).toUpperCase(),
    [TEXT, '{text}.toUpperCase()', 'Converts to upper case.', '{name}.toUpperCase()  →  "ADA"']),
  toLowerCase:      method(0, 0, (s) => strify(s).toLowerCase(),
    [TEXT, '{text}.toLowerCase()', 'Converts to lower case.', '{name}.toLowerCase()  →  "ada"']),
  trim:             method(0, 0, (s) => strify(s).trim(),
    [TEXT, '{text}.trim()', 'Removes leading and trailing spaces.', '"  hi ".trim()  →  "hi"']),
  length:           method(0, 0, (s) => strify(s).length,
    [TEXT, '{text}.length()', 'Number of characters.', '{name}.length()  →  3']),
  substring:        method(1, 2, (s, begin, end) => {
    const t = strify(s);
    const from = clamp(toIndex(begin, 0), 0, t.length);
    const to = end === undefined ? t.length : clamp(toIndex(end, t.length), 0, t.length);
    return from <= to ? t.slice(from, to) : '';
  }, [TEXT, '{text}.substring(begin, end?)',
    'Characters from position begin up to, but not including, end (default: to the end). Positions start at 0; out-of-range values are clamped, never an error.',
    '{code}.substring(0, 4)  →  "ABCD" for "ABCDEFG"']),
  charAt:           method(1, 1, (s, i) => strify(s).charAt(toIndex(i, 0)),
    [TEXT, '{text}.charAt(index)', 'The single character at position index (0-based); empty if out of range.', '{code}.charAt(1)  →  "B" for "ABC"']),
  indexOf:          method(1, 2, (s, t, from) => strify(s).indexOf(strify(t), from === undefined ? 0 : Math.max(0, toIndex(from, 0))),
    [TEXT, '{text}.indexOf(find, from?)', 'Position of the first occurrence of find at or after from (default 0), or -1 if absent.', '{code}.indexOf("-")  →  3 for "ABC-12"']),
  contains:         method(1, 1, (s, t) => strify(s).includes(strify(t)),
    [TEXT, '{text}.contains(find)', 'true if find appears anywhere in text.', '{email}.contains("@")  →  true']),
  startsWith:       method(1, 1, (s, t) => strify(s).startsWith(strify(t)),
    [TEXT, '{text}.startsWith(prefix)', 'true if text begins with prefix.', '{code}.startsWith("AB")']),
  endsWith:         method(1, 1, (s, t) => strify(s).endsWith(strify(t)),
    [TEXT, '{text}.endsWith(suffix)', 'true if text ends with suffix.', '{file}.endsWith(".java")']),
  equals:           method(1, 1, (a, b) => strify(a) === strify(b),
    [TEXT, '{text}.equals(other)', 'true if both have exactly the same text (case-sensitive). Same as ==.', '{s}.equals("A") ? 1 : 0']),
  equalsIgnoreCase: method(1, 1, (a, b) => strify(a).toLowerCase() === strify(b).toLowerCase(),
    [TEXT, '{text}.equalsIgnoreCase(other)', 'Like equals, ignoring upper/lower case.', '{s}.equalsIgnoreCase("yes")']),
  isEmpty:          method(0, 0, (s) => strify(s) === '',
    [TEXT, '{text}.isEmpty()', 'true if text has no characters.', '{nick}.isEmpty() ? {name} : {nick}']),
  isBlank:          method(0, 0, (s) => strify(s).trim() === '',
    [TEXT, '{text}.isBlank()', 'true if text is empty or only spaces.', '{nick}.isBlank()']),
  // Replaces every occurrence of a literal substring (like Java's String.replace).
  replace:          method(2, 2, (s, t, r) => (strify(t) === '' ? strify(s) : strify(s).split(strify(t)).join(strify(r))),
    [TEXT, '{text}.replace(find, with)', 'Replaces every occurrence of find with the replacement text (not a pattern).', '{phone}.replace("-", "")  →  "5551234"']),
  // {v}.match(k1, r1, k2, r2, ..., [default]) — a lookup table, e.g. for
  // remapping enum literals. Returns the result paired with the first key equal
  // to v; otherwise the trailing default if one was given, else v unchanged.
  match:            method(1, Infinity, (v, ...rest) => {
    for (let i = 0; i + 1 < rest.length; i += 2) {
      if (strify(rest[i]) === strify(v)) return rest[i + 1];
    }
    return rest.length % 2 === 1 ? rest[rest.length - 1] : v;
  }, [GENERAL, '{value}.match(key1, result1, key2, result2, ..., default?)',
    'Lookup table: returns the result next to the first key equal to value. With a trailing default it is used when nothing matches; without one the value passes through unchanged. Good for remapping enum literals.',
    '{status}.match("A", "Active", "I", "Inactive", "Unknown")']),

  // numeric — plain functions
  round:            func(1, 2, (v, places) => {
    const f = 10 ** clamp(toIndex(places, 0), 0, 12);
    return Math.round(Number(v) * f) / f;
  }, [NUMBER, 'round(number, places?)', 'Rounds to places decimal places (default 0, a whole number).', 'round({price} * 1.15, 2)']),
  abs:              func(1, 1, (v) => Math.abs(Number(v)),
    [NUMBER, 'abs(number)', 'Absolute value (drops the minus sign).', 'abs({delta})']),
  floor:            func(1, 1, (v) => Math.floor(Number(v)),
    [NUMBER, 'floor(number)', 'Rounds down to a whole number.', 'floor(2.9)  →  2']),
  ceil:             func(1, 1, (v) => Math.ceil(Number(v)),
    [NUMBER, 'ceil(number)', 'Rounds up to a whole number.', 'ceil(2.1)  →  3']),
  min:              func(2, Infinity, (...a) => Math.min(...a.map(Number)),
    [NUMBER, 'min(a, b, ...)', 'The smallest of two or more numbers.', 'min({qty}, 10)']),
  max:              func(2, Infinity, (...a) => Math.max(...a.map(Number)),
    [NUMBER, 'max(a, b, ...)', 'The largest of two or more numbers.', 'max({qty}, 0)']),
  // First argument that isn't empty, else ''.
  coalesce:         func(1, Infinity, (...a) => a.find((v) => strify(v) !== '') ?? '',
    [GENERAL, 'coalesce(a, b, ...)', 'The first value that is not empty — handy for defaults.', 'coalesce({nick}, {name}, "(none)")']),
};

// Names used by earlier versions (including the original function-call forms).
// Not accepted any more, but the error says what to write instead.
const RENAMED = { upper: 'toUpperCase', lower: 'toLowerCase', len: 'length' };

// Matched case-insensitively.
const FUNCTION_LOOKUP = new Map(Object.entries(FUNCTIONS).map(([name, f]) => [name.toLowerCase(), { name, ...f }]));
const lookupFunction = (name) => FUNCTION_LOOKUP.get(name.toLowerCase());

// Reference data for the rule editor's panel — derived from the table above so
// the documentation can't drift from what actually evaluates.
export const FUNCTION_REFERENCE = Object.entries(FUNCTIONS).map(([name, f]) => {
  const [group, signature, description, example] = f.doc;
  return { name, kind: f.kind, group, signature, description, example };
});

function describeArity(f) {
  if (f.max === Infinity) return `at least ${f.min} argument${f.min === 1 ? '' : 's'}`;
  if (f.min === f.max) return `${f.min} argument${f.min === 1 ? '' : 's'}`;
  return `${f.min} to ${f.max} arguments`;
}

// `args` are the arguments as typed; for a method call `receiver` is the value
// the method is called on.
function callFunction(name, args, receiver, isMethod) {
  const f = lookupFunction(name);
  const renamed = RENAMED[name.toLowerCase()];
  if (!f) {
    if (renamed) {
      const hint = isMethod ? `.${renamed}()` : `{text}.${renamed}()`;
      throw new Error(`Unknown ${isMethod ? `method ".${name}()"` : `function "${name}"`} — did you mean ${hint}?`);
    }
    throw new Error(isMethod ? `Unknown method ".${name}()"` : `Unknown function "${name}"`);
  }
  if (f.kind === 'method' && !isMethod) {
    throw new Error(`${f.name}() is a method — call it on a value, e.g. {text}.${f.name}(${args.length > 1 ? '…' : ''})`);
  }
  if (f.kind === 'function' && isMethod) {
    throw new Error(`${f.name}() is a plain function — write ${f.name}(value${f.max > 1 ? ', …' : ''}), not value.${f.name}()`);
  }
  if (args.length < f.min || args.length > f.max) {
    throw new Error(`${f.name}() takes ${describeArity(f)}`);
  }
  return isMethod ? f.run(receiver, ...args) : f.run(...args);
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
    // A '.' that isn't part of a number starts a method call: {s}.trim()
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

  // primary followed by any number of .method(args) calls: {s}.trim().toUpperCase()
  function parsePostfix() {
    let v = parsePrimary();
    while (isOp('.')) {
      next();
      const id = next();
      if (!id || id.t !== 'ident') throw new Error('Expected a method name after "."');
      v = callFunction(id.v, parseArgs(id.v), v, true);
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
      return callFunction(tk.v, parseArgs(tk.v), undefined, false);
    }
    throw new Error(`Unexpected token "${tk.v}"`);
  }

  if (tokens.length === 0) return '';
  const result = parseTernary();
  if (pos < tokens.length) throw new Error('Unexpected trailing input in expression');
  return strify(result);
}
