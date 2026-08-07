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
    this.doc.setFont(undefined, 'bold');
    this.doc.setFontSize(16);
    this.doc.text(text, this.margin, this.y);
    this.y += 22;
    this.doc.setFont(undefined, 'normal');
  }

  subheading(text) {
    this.ensureSpace(18);
    this.doc.setFont(undefined, 'bold');
    this.doc.setFontSize(12);
    this.doc.text(text, this.margin, this.y);
    this.y += 16;
    this.doc.setFont(undefined, 'normal');
  }

  // Wraps to contentWidth, adding a page mid-paragraph if needed.
  line(text, { size = 10, indent = 0, mono = false, color = '#000000' } = {}) {
    this.doc.setFont(undefined, mono ? 'courier' : 'helvetica');
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
}
