// Minimal line-oriented Java tokenizer for PDF code embedding — not a real
// lexer/parser, just enough to color keywords/strings/comments/numbers the
// way Monaco's "vs-dark" theme does (the IDE's own editor theme, see
// CodeEditor.jsx), so a report's embedded source at least visually reads
// like the IDE instead of flat monochrome text. Tracks block-comment state
// across lines since a report embeds a whole file's lines one at a time.

export const JAVA_TOKEN_COLORS = {
  keyword: '#569CD6',
  string: '#CE9178',
  comment: '#6A9955',
  number: '#B5CEA8',
  default: '#D4D4D4',
};

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'var', 'record', 'sealed', 'permits', 'yield', 'true', 'false', 'null',
]);

const TOKEN_RE = /\/\/.*$|\/\*[\s\S]*?\*\/|\/\*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+\.?\d*[fFdDlL]?\b|[A-Za-z_$][A-Za-z0-9_$]*|\s+|./g;

export function initJavaHighlightState() {
  return { inBlockComment: false };
}

// Returns { tokens: [{text, color}], state } — pass the returned state back
// in as the next line's input state to keep block comments (/* ... */)
// colored correctly across line boundaries.
export function tokenizeJavaLine(line, state) {
  const tokens = [];
  let startIndex = 0;

  if (state.inBlockComment) {
    const end = line.indexOf('*/');
    if (end === -1) {
      return { tokens: [{ text: line, color: JAVA_TOKEN_COLORS.comment }], state };
    }
    tokens.push({ text: line.slice(0, end + 2), color: JAVA_TOKEN_COLORS.comment });
    startIndex = end + 2;
    state = { inBlockComment: false };
  }

  TOKEN_RE.lastIndex = startIndex;
  let m;
  while ((m = TOKEN_RE.exec(line))) {
    const t = m[0];
    if (t.startsWith('//')) {
      tokens.push({ text: t, color: JAVA_TOKEN_COLORS.comment });
      continue;
    }
    if (t.startsWith('/*')) {
      if (t.endsWith('*/') && t.length >= 4) {
        tokens.push({ text: t, color: JAVA_TOKEN_COLORS.comment });
      } else {
        tokens.push({ text: line.slice(m.index), color: JAVA_TOKEN_COLORS.comment });
        state = { inBlockComment: true };
        break;
      }
      continue;
    }
    if (t.startsWith('"') || t.startsWith("'")) {
      tokens.push({ text: t, color: JAVA_TOKEN_COLORS.string });
      continue;
    }
    if (/^\d/.test(t)) {
      tokens.push({ text: t, color: JAVA_TOKEN_COLORS.number });
      continue;
    }
    if (/^[A-Za-z_$]/.test(t)) {
      tokens.push({ text: t, color: JAVA_KEYWORDS.has(t) ? JAVA_TOKEN_COLORS.keyword : JAVA_TOKEN_COLORS.default });
      continue;
    }
    tokens.push({ text: t, color: JAVA_TOKEN_COLORS.default });
  }
  return { tokens, state };
}
