import { tokenizeJavaLine, initJavaHighlightState } from './javaSyntaxHighlight';

// Matches Monaco's "vs-dark" theme (CodeEditor.jsx's own `theme="vs-dark"`)
// so a report's embedded source at least reads like a screenshot of the IDE.
const CODE_BG = '#1e1e1e';
const GUTTER_COLOR = '#858585';

// jsPDF's standard 14 fonts (Courier included) only support WinAnsi's
// single-byte range. javaCodeGen.js's own box-drawing section separators
// (e.g. "// ── Capsule ports ──") use characters outside that range —
// passing one through to doc.text() doesn't just render a missing-glyph
// box for that one character, it corrupts the WHOLE line (jsPDF appears to
// switch the entire string to a 2-byte encoding the single-byte Courier
// font then misreads, spacing every character out with stray glyphs).
// Map the handful of characters generated code actually uses to safe
// ASCII lookalikes, and fall back to '?' for anything else out of range.
const PDF_FONT_CHAR_MAP = {
  '─': '-', '━': '-', '│': '|', '┃': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+',
  '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+', '═': '=', '║': '|',
  '╔': '+', '╗': '+', '╚': '+', '╝': '+', '╠': '+', '╣': '+', '╦': '+', '╩': '+', '╬': '+',
  '•': '*', '…': '...', '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-',
};

function sanitizeForPdfFont(s) {
  let out = '';
  for (const ch of s) {
    if (PDF_FONT_CHAR_MAP[ch]) { out += PDF_FONT_CHAR_MAP[ch]; continue; }
    out += ch.codePointAt(0) > 255 ? '?' : ch;
  }
  return out;
}

// Shared cursor-based writer over jsPDF's core API — no autotable/extra
// plugin dependency, since every report in this app is really headings +
// wrapped lines + (for the full "Generate Report") embedded diagram
// images, not a genuine data-grid layout. Tracks the current Y position
// and adds a page automatically once content would overflow. Used by both
// generateTransformReport.js and generateFullReport.js.
export class PdfWriter {
  constructor(doc) {
    this.doc = doc;
    this.margin = 40;
    this.y = this.margin;
    this.pageWidth = doc.internal.pageSize.getWidth();
    this.pageHeight = doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
  }

  ensureSpace(h) {
    if (this.y + h > this.pageHeight - this.margin) {
      this.doc.addPage();
      this.y = this.margin;
    }
  }

  newPage() {
    this.doc.addPage();
    this.y = this.margin;
  }

  heading(text) {
    this.ensureSpace(28);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.text(text, this.margin, this.y);
    this.y += 22;
    this.doc.setFont('helvetica', 'normal');
  }

  subheading(text) {
    this.ensureSpace(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.text(text, this.margin, this.y);
    this.y += 16;
    this.doc.setFont('helvetica', 'normal');
  }

  // Wraps to contentWidth, adding a page mid-paragraph if needed.
  line(text, { size = 10, indent = 0, mono = false, color = '#000000' } = {}) {
    // setFont(fontName, fontStyle) — the name/style order matters: jsPDF
    // silently no-ops (falls back to whatever font was already active)
    // if 'courier' lands in the style slot instead of the name slot.
    this.doc.setFont(mono ? 'courier' : 'helvetica', 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
    const wrapped = this.doc.splitTextToSize(String(text ?? ''), this.contentWidth - indent);
    for (const ln of wrapped) {
      this.ensureSpace(size * 1.3);
      this.doc.text(ln, this.margin + indent, this.y);
      this.y += size * 1.3;
    }
    this.doc.setTextColor('#000000');
  }

  spacer(h = 10) {
    this.y += h;
  }

  hr() {
    this.ensureSpace(10);
    this.doc.setDrawColor('#cccccc');
    this.doc.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 10;
  }

  // Embeds a captured diagram image, scaled to fit the content width
  // (never upscaled past its natural size). jsPDF's addImage can't split
  // one image across a page boundary, so a diagram taller than a whole
  // page gets its own dedicated page and is scaled down to fit that page's
  // height too, rather than being silently cropped.
  image(dataUrl, naturalWidth, naturalHeight, format = 'JPEG') {
    const widthScale = Math.min(1, this.contentWidth / naturalWidth);
    let w = naturalWidth * widthScale;
    let h = naturalHeight * widthScale;
    const maxH = this.pageHeight - this.margin * 2;
    if (h > maxH) {
      const heightScale = maxH / naturalHeight;
      w = naturalWidth * heightScale;
      h = naturalHeight * heightScale;
      this.newPage();
    } else {
      this.ensureSpace(h);
    }
    this.doc.addImage(dataUrl, format, this.margin, this.y, w, h);
    this.y += h + 10;
  }

  // Renders a source file's lines as syntax-highlighted monospace text on
  // a dark background with a line-number gutter, matching the IDE's own
  // Monaco editor rather than plain black-on-white text. Deliberately does
  // NOT word-wrap long lines (a real editor doesn't either) — instead a
  // line that wouldn't fit within the page's right margin is clipped with
  // a trailing "…" marker (computed in characters, since Courier is
  // monospace) rather than being allowed to run off the page edge.
  //
  // Pre-splits into per-page chunks up front so each page's background
  // rectangle is sized exactly to the lines that land on it — painting one
  // rect per line (or one guessed-height rect up front) either thrashes
  // fill calls or leaves a dark box bleeding into empty space below a
  // short final chunk.
  codeBlock(lines) {
    const size = 8;
    const lineHeight = size * 1.35;
    this.doc.setFont('courier', 'normal');
    this.doc.setFontSize(size);
    const charWidth = this.doc.getTextWidth('M');
    const gutterWidth = (String(lines.length).length + 2) * charWidth;
    const codeX = this.margin + gutterWidth;
    const maxChars = Math.max(10, Math.floor((this.contentWidth - gutterWidth) / charWidth) - 1);
    lines = lines.map((raw) => {
      const clean = sanitizeForPdfFont(raw);
      return clean.length > maxChars ? clean.slice(0, maxChars - 3) + '...' : clean;
    });

    // Avoid stranding a sliver of code (and its background) right above a
    // page break — start fresh if less than 2 lines would fit here.
    if (this.pageHeight - this.margin - this.y < lineHeight * 2) this.newPage();

    const chunks = [];
    let cursor = 0;
    let y = this.y;
    while (cursor < lines.length) {
      const avail = this.pageHeight - this.margin - y;
      const fit = Math.max(1, Math.min(Math.floor(avail / lineHeight), lines.length - cursor));
      chunks.push(lines.slice(cursor, cursor + fit));
      cursor += fit;
      y = this.margin;
    }

    let state = initJavaHighlightState();
    let lineNo = 1;
    chunks.forEach((chunk, idx) => {
      if (idx > 0) { this.doc.addPage(); this.y = this.margin; }
      const boxH = chunk.length * lineHeight + 6;
      this.doc.setFillColor(CODE_BG);
      this.doc.rect(this.margin - 4, this.y - lineHeight * 0.8, this.contentWidth + 8, boxH, 'F');
      for (const raw of chunk) {
        this.doc.setTextColor(GUTTER_COLOR);
        this.doc.text(String(lineNo), codeX - charWidth, this.y, { align: 'right' });
        const { tokens, state: nextState } = tokenizeJavaLine(raw, state);
        state = nextState;
        let x = codeX;
        for (const tok of tokens) {
          if (!tok.text) continue;
          this.doc.setTextColor(tok.color);
          this.doc.text(tok.text, x, this.y);
          x += tok.text.length * charWidth;
        }
        this.y += lineHeight;
        lineNo++;
      }
    });
    this.doc.setTextColor('#000000');
    this.doc.setFont('helvetica', 'normal');
    this.y += 8;
  }
}
