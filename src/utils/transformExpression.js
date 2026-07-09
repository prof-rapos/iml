// Minimal, safe expression evaluator for transform attribute mappings.
//
// It lets a target attribute be *computed* from source attributes rather than
// only copied. No eval() — a tiny tokeniser + recursive-descent parser.
//
// Grammar:
//   expr   := term  (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := number | string | '{' ref '}' | '(' expr ')' | '-' factor
//
// - {name}  resolves against `scope` (source attribute name → value).
// - "text" or 'text' is a string literal.
// - '+' adds when BOTH operands are numeric, otherwise concatenates.
// - '-', '*', '/' are always numeric.
//
// Examples:
//   {firstName} + " " + {lastName}   →  "Ada Lovelace"
//   {price} * 1.1                    →  numeric
//   ({a} + {b}) / 2                  →  numeric average

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
    if ('+-*/()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
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

  function parseExpr() {
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
      const v = parseExpr();
      if (!peek() || peek().v !== ')') throw new Error('Missing ")"');
      next();
      return v;
    }
    if (tk.t === 'num') { next(); return tk.v; }
    if (tk.t === 'str') { next(); return tk.v; }
    if (tk.t === 'ref') { next(); return resolveRef(scope, tk.v); }
    throw new Error(`Unexpected token "${tk.v}"`);
  }

  if (tokens.length === 0) return '';
  const result = parseExpr();
  if (pos < tokens.length) throw new Error('Unexpected trailing input in expression');
  return strify(result);
}
