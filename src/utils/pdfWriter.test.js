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
