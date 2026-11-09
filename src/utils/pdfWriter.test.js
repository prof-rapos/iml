import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { PdfWriter } from './pdfWriter';

// jsPDF's default output isn't compressed, so raw Tj-operator text is
// directly greppable — the same technique used to live-verify these fixes.
function extractTextOps(doc) {
  const raw = doc.output();
  const texts = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m;
  while ((m = re.exec(raw))) texts.push(m[1]);
  return texts;
}

describe('PdfWriter.codeBlock', () => {
  it('replaces box-drawing separator characters with ASCII, not corrupting the whole line', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    w.codeBlock(['// ── Capsule ports ──────────────────────────────']);
    const texts = extractTextOps(doc);
    expect(texts.some((t) => t.includes('Capsule ports'))).toBe(true);
    expect(texts.some((t) => t.includes('──'))).toBe(false);
  });

  it('clips a line wider than the page instead of running it off the edge', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    const longLine = 'x'.repeat(400);
    w.codeBlock([longLine]);
    const texts = extractTextOps(doc);
    const rendered = texts.join('');
    expect(rendered.length).toBeLessThan(longLine.length);
    expect(rendered.endsWith('...')).toBe(true);
  });

  it('leaves a short line untouched', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    w.codeBlock(['int x = 1;']);
    const texts = extractTextOps(doc);
    expect(texts.join('')).toBe('1int x = 1;');
  });
});

describe('PdfWriter.table', () => {
  const columns = [{ header: 'Name', width: 1 }, { header: 'Detail', width: 2 }];

  it('renders the header and every cell', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    w.table(columns, [['alpha', 'first'], ['beta', 'second']]);
    const rendered = extractTextOps(doc).join('|');
    for (const text of ['Name', 'Detail', 'alpha', 'first', 'beta', 'second']) {
      expect(rendered).toContain(text);
    }
  });

  it('breaks across pages and repeats the header on each new page', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    w.table(columns, Array.from({ length: 120 }, (_, i) => [`row${i}`, 'x']));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const headerCount = extractTextOps(doc).filter((t) => t === 'Name').length;
    expect(headerCount).toBe(doc.getNumberOfPages());
  });

  it('advances the cursor so following content lands below the table', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const w = new PdfWriter(doc);
    const before = w.y;
    w.table(columns, [['a', 'b']]);
    expect(w.y).toBeGreaterThan(before);
  });
});
