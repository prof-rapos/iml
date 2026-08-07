import { toJpeg, toSvg } from 'html-to-image';

// Reads a transformed element's flow-space bounding box straight off its own
// inline `transform`, without needing React Flow's own getNodesBounds()/
// useReactFlow() (the Topbar components that trigger an export live outside
// their diagram's ReactFlowProvider in at least two of the three views, so
// the hook isn't reliably available at the export call site). Handles BOTH
// transform conventions used across this app's node/edge-label components:
// a plain node is `translate(x,y)` (x,y = its own top-left corner); an edge
// label is `translate(F%, F%) translate(x,y)` for some percentage F (-50% to
// center on the point, -160% to sit clear above it, etc — every edge type
// uses a different F) — parsing BOTH translate() calls and resolving the
// percentage one against the element's own measured size handles any F
// without needing to special-case each edge component's convention.
function elementFlowBox(el) {
  const transform = el.style.transform || '';
  let px = 0, py = 0, fx = 0, fy = 0;
  for (const m of transform.matchAll(/translate\(([^,]+),\s*([^)]+)\)/g)) {
    const [, rawX, rawY] = m;
    if (rawX.trim().endsWith('%')) fx += parseFloat(rawX) / 100; else px += parseFloat(rawX);
    if (rawY.trim().endsWith('%')) fy += parseFloat(rawY) / 100; else py += parseFloat(rawY);
  }
  const w = el.offsetWidth, h = el.offsetHeight;
  const x = px + fx * w;
  const y = py + fy * h;
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

// Every node PLUS every edge label (dragged transition labels, relation
// multiplicities, etc — all rendered via <EdgeLabelRenderer> into a shared
// `.react-flow__edgelabel-renderer` container) needs to count toward the
// export's bounds — a label can sit well outside every node's own box (a
// transition label dragged out along a long edge, or one routed far from
// its states), and leaving it out of the bounds calculation was cropping it
// out of the exported image even though it's visually present on the live
// canvas (reported: "background is sometimes trimmed").
function measureFlowBounds(root) {
  const nodeEls = root.querySelectorAll('.react-flow__node');
  const labelEls = root.querySelectorAll('.react-flow__edgelabel-renderer [style*="translate"]');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of [...nodeEls, ...labelEls]) {
    const box = elementFlowBox(el);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }
  return { minX, minY, maxX, maxY, nodeCount: nodeEls.length };
}

// SVG <marker> definitions (arrowheads — diamond/triangle/open-arrow, see
// SvgMarkers.jsx) are referenced by edges via `marker-end="url(#id)"`, but
// the <defs> that actually DEFINE them is rendered as a sibling of
// `.react-flow__viewport`, not a descendant — a same-document `url(#id)`
// reference resolves fine live (any element in the page, regardless of
// which <svg> it's nested in), but once html-to-image clones just the
// viewport subtree into a STANDALONE image, that reference points at
// nothing and the arrowhead silently doesn't render (reported: "arrow heads
// not appearing"). Fixed by cloning every <marker> in the live document into
// a throwaway <defs> and temporarily grafting it into the captured subtree
// for the duration of the capture only — restored via try/finally so the
// live canvas is never left in a different state.
function graftMarkerDefs(viewport) {
  const markers = document.querySelectorAll('marker');
  if (markers.length === 0) return null;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(svgNS, 'defs');
  markers.forEach((m) => defs.appendChild(m.cloneNode(true)));
  svg.appendChild(defs);
  viewport.insertBefore(svg, viewport.firstChild);
  return svg;
}

// A background-color set directly on `.react-flow__viewport` (the same
// element the capture's positioning transform is applied to) gets shifted
// right along with it — CSS transform moves an element's whole painted box,
// background included, so the color only actually covers flow-space
// (minX-PADDING, minY-PADDING) .. that + (width,height), NOT the capture's
// own (0,0)..(width,height) canvas. For `toJpeg` this is invisible because
// html-to-image separately pre-fills the WHOLE output canvas with
// `backgroundColor` before drawing the rendered content on top (a genuine
// base fill, unaffected by any content transform) — but `toSvg` has no such
// canvas-level fill, so the gap it leaves is real and visible (reported:
// "the bounds issue still exists for SVG, but fixed in JPG" — same
// diagram, same bounds math, format-dependent because of THIS, not the
// bounds calculation itself). Fixed the same way the marker grafting above
// does — insert a real background element as a VIEWPORT CHILD, positioned
// with the same `translate(x,y)` convention every other child uses, chosen
// so the viewport's own transform cancels it out and it lands exactly on
// the capture's (0,0)..(width,height), regardless of format.
function graftBackgroundRect(viewport, minX, minY, width, height, color) {
  const rect = document.createElement('div');
  rect.style.position = 'absolute';
  rect.style.transform = `translate(${minX - PADDING}px, ${minY - PADDING}px)`;
  rect.style.width = `${width}px`;
  rect.style.height = `${height}px`;
  rect.style.background = color;
  viewport.insertBefore(rect, viewport.firstChild);
  return rect;
}

// The live canvas background is a themed CSS custom property
// (`--iml-canvas-bg`, a mid-gray, applied via React Flow's own `.react-flow
// __background` element from the <Background> component every canvas
// renders) — NOT the much darker literal hex values this export used to
// hardcode per-view, which is why some edges (stroked near-black to read
// against the real, lighter live background) were reported as nearly
// invisible against the export's own, too-dark background. Reads the
// `.react-flow__background` element's own resolved color first (it's a
// DESCENDANT of the diagram root, so an ancestor walk-up alone would miss
// it); falls back to walking up from the root for a canvas that doesn't
// render one, matching what a viewer would actually see live rather than
// guessing a color per caller.
function resolveVisibleBackground(root) {
  const isOpaque = (bg) => bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(bg);
  const bgLayer = root.querySelector('.react-flow__background');
  if (bgLayer) {
    const bg = getComputedStyle(bgLayer).backgroundColor;
    if (isOpaque(bg)) return bg;
  }
  for (let node = root; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (isOpaque(bg)) return bg;
  }
  return '#ffffff';
}

// Generous enough to cover a node's drop-shadow or a label's own padding —
// this is a best-effort visual margin on top of the exact measured bounds
// above, not a value anything else depends on.
const PADDING = 60;

// Exports a whole React Flow diagram (every node/edge, not just what's
// currently panned/zoomed into view) as one image. The naive approach —
// html-to-image straight on `.react-flow` — only ever captures the visible,
// CSS-clipped viewport, so a diagram bigger than the on-screen canvas got
// silently cropped (reported against both the SET Viewer and the structural
// canvas). Fixed by capturing `.react-flow__viewport` itself (the element
// nodes/edges actually live in) with its transform OVERRIDDEN, for the
// capture only, to fit the diagram's full bounding box — html-to-image
// applies `style` to a clone it renders offscreen, so this never touches
// the live, on-screen canvas or its current pan/zoom.
//
// `format: 'svg'` uses html-to-image's toSvg() instead of toJpeg() — real
// vector output (edges are already SVG paths; node content is embedded as
// live, still-selectable HTML/text via <foreignObject>), so it stays crisp
// at any zoom instead of a fixed-resolution raster. It's also the only
// option that scales cleanly for a genuinely huge diagram (a several-
// hundred-node SET can exceed ~38000px wide): 'jpeg' rasterizes through an
// HTML canvas, which browsers cap at a maximum width (commonly 16384px) —
// past that, the whole image gets silently scaled DOWN to fit (verified:
// proportional, not cropped, so no content is lost, just resolution). 'svg'
// has no such ceiling since it's never rasterized to a fixed pixel grid.
// `beforeCapture`, if given, runs first (e.g. clearing whichever store's
// selection drives the live canvas's selected-node/edge styling — reported:
// "the highlighting in an export seems odd"). It's a plain synchronous
// Zustand `set()` call in every caller, which schedules a React re-render
// but doesn't guarantee it's committed to the DOM by the time this function
// returns — waits two animation frames afterward so the browser has
// actually painted the deselected state before anything below reads the
// DOM (bounds measurement, then the capture itself).
export async function exportFlowImage({ container, format = 'jpeg', backgroundColor, filename, beforeCapture }) {
  if (beforeCapture) {
    beforeCapture();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  const root = container ?? document.querySelector('.react-flow');
  const viewport = root?.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('No diagram found to export.');

  const { minX, minY, maxX, maxY, nodeCount } = measureFlowBounds(root);
  if (nodeCount === 0) throw new Error('Nothing to export — the diagram is empty.');

  const width = Math.ceil(maxX - minX) + PADDING * 2;
  const height = Math.ceil(maxY - minY) + PADDING * 2;
  const resolvedBackground = backgroundColor ?? resolveVisibleBackground(root);

  const markerDefs = graftMarkerDefs(viewport);
  const backgroundRect = graftBackgroundRect(viewport, minX, minY, width, height, resolvedBackground);
  try {
    const capture = format === 'svg' ? toSvg : toJpeg;
    const dataUrl = await capture(viewport, {
      ...(format === 'jpeg' ? { quality: 0.95 } : {}),
      backgroundColor: resolvedBackground,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${-minX + PADDING}px, ${-minY + PADDING}px) scale(1)`,
      },
    });

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  } finally {
    if (markerDefs) viewport.removeChild(markerDefs);
    viewport.removeChild(backgroundRect);
  }
}
