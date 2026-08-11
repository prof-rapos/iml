// Minimal, safe expression evaluator for transform attribute mappings.
//
// It lets a target attribute be *computed* from source attributes rather than
// only copied. No eval() — a tiny tokeniser + recursive-descent parser.
//
// Grammar:
//   expr       := ternary
//   ternary    := comparison ('?' ternary ':' ternary)?
//   comparison := arith (('>' | '<' | '>=' | '<=' | '==' | '!=') arith)?
//   arith      := term (('+' | '-') term)*
//   term       := factor (('*' | '/') factor)*
//   factor     := number | string | '{' ref '}' | '(' expr ')' | '-' factor
//               | IDENT '(' expr ')'
//
// - {name}  resolves against `scope` (source attribute name → value).
// - "text" or 'text' is a string literal.
// - '+' adds when BOTH operands are numeric, otherwise concatenates.
// - '-', '*', '/' are always numeric.
// - comparisons compare numerically when BOTH operands look numeric,
//   otherwise lexicographically as strings (so e.g. {name} > "M" works).
// - a ternary's condition is truthy per truthy() below when it isn't itself
//   a comparison (e.g. a bare {flag} ? "on" : "off" — a BOOLEAN attribute's
//   own "true"/"false" string reads naturally here without needing
//   {flag} == "true").
// - a handful of single-argument functions (see FUNCTIONS below) can wrap
//   any sub-expression, including another function call: upper(trim({name})).
//
// Examples:
//   {firstName} + " " + {lastName}       →  "Ada Lovelace"
//   {price} * 1.1                        →  numeric
//   ({a} + {b}) / 2                      →  numeric average
//   {x} > 10 ? "large" : "small"
//   {active} ? {name} : "(inactive)"
//   upper({name})                        →  "ADA"
//   round({price} * 1.15)                →  numeric, rounded

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

function add(a, b) {
  if (isNumericValue(a) && isNumericValue(b)) return Number(a) + Number(b);
  return strify(a) + strify(b);
}

// Numeric compare when both sides look numeric, else lexicographic string
// compare (so a name/text comparison like {status} == "done" or
// {name} > "M" is meaningful, not just always-false).
function compare(a, b, op) {
  let cmp;
  if (isNumericValue(a) && isNumericValue(b)) {
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

// Single-argument functions callable from an expression, e.g. upper({name}).
// Operate on the raw intermediate value (number or string, same as the
// arithmetic/comparison operators above) rather than a pre-stringified one,
// so e.g. round({price} * 1.15) sees the actual number, not "11.5".
// Names are matched case-insensitively (see the 'ident' factor below).
const FUNCTIONS = {
  upper: (v) => strify(v).toUpperCase(),
  lower: (v) => strify(v).toLowerCase(),
  trim:  (v) => strify(v).trim(),
  round: (v) => Math.round(Number(v)),
  abs:   (v) => Math.abs(Number(v)),
  len:   (v) => strify(v).length,
};

function resolveRef(scope, name) {
  const v = scope[name];
  if (v === undefined) return '';                       // unknown ref → empty
  if (Array.isArray(v)) return v.filter((x) => String(x).trim() !== '').join(' ');
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
    if (c === '?' || c === ':') { tokens.push({ t: 'op', v: c }); i++; continue; }
    if ('<>=!'.includes(c)) {
      const two = s.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
        tokens.push({ t: 'op', v: two }); i += 2; continue;
      }
      if (c === '>' || c === '<') { tokens.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`Unexpected character "${c}" in expression`);
    }
    if ('+-*/()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
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
// Throws on malformed input — callers should catch and fall back.
export function evalExpression(input, scope = {}) {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const COMPARISON_OPS = ['>', '<', '>=', '<=', '==', '!='];

  function parseTernary() {
    const cond = parseComparison();
    if (peek() && peek().t === 'op' && peek().v === '?') {
      next();
      const thenVal = parseTernary();
      if (!peek() || peek().v !== ':') throw new Error('Expected ":" in ternary expression');
      next();
      const elseVal = parseTernary();
      return truthy(cond) ? thenVal : elseVal;
    }
    return cond;
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
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      const right = parseTerm();
      left = op === '+' ? add(left, right) : (Number(left) - Number(right));
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      const right = parseFactor();
      left = op === '*' ? (Number(left) * Number(right)) : (Number(left) / Number(right));
    }
    return left;
  }

  function parseFactor() {
    const tk = peek();
    if (!tk) throw new Error('Unexpected end of expression');
    if (tk.t === 'op' && tk.v === '-') { next(); return -Number(parseFactor()); }
    if (tk.t === 'op' && tk.v === '(') {
      next();
      const v = parseTernary();
      if (!peek() || peek().v !== ')') throw new Error('Missing ")"');
      next();
      return v;
    }
    if (tk.t === 'num') { next(); return tk.v; }
    if (tk.t === 'str') { next(); return tk.v; }
    if (tk.t === 'ref') { next(); return resolveRef(scope, tk.v); }
    if (tk.t === 'ident') {
      next();
      const fn = FUNCTIONS[tk.v.toLowerCase()];
      if (!fn) throw new Error(`Unknown function "${tk.v}"`);
      if (!peek() || peek().v !== '(') throw new Error(`Expected "(" after "${tk.v}"`);
      next();
      const arg = parseTernary();
      if (!peek() || peek().v !== ')') throw new Error(`Missing ")" after ${tk.v}(...)`);
      next();
      return fn(arg);
    }
    throw new Error(`Unexpected token "${tk.v}"`);
  }

  if (tokens.length === 0) return '';
  const result = parseTernary();
  if (pos < tokens.length) throw new Error('Unexpected trailing input in expression');
  return strify(result);
}
