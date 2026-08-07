import { toJpeg, toSvg } from 'html-to-image';

// Reads every rendered node's flow-space position/size straight off the DOM
// (each `.react-flow__node` carries its own `transform: translate(x,y)px`,
// set by React Flow in flow-space — i.e. BEFORE the viewport's own pan/zoom
// transform is applied) and returns the bounding box that contains all of
// them. Deliberately DOM-only, not React Flow's own getNodesBounds(): the
// Topbar components that trigger an export live outside their diagram's
// ReactFlowProvider (each of Structural/Behavioural/MBT wires this up
// differently — some share a provider with the canvas, some don't), so the
// useReactFlow() hook isn't reliably available at the export call site.
function measureFlowBounds(nodeEls) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of nodeEls) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
    if (!m) continue;
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + el.offsetWidth);
    maxY = Math.max(maxY, y + el.offsetHeight);
  }
  return { minX, minY, maxX, maxY };
}

// Generous enough to cover a transition label dragged out past its edge, or
// a node's drop-shadow — this is a best-effort visual margin, not a value
// anything else depends on.
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
export async function exportFlowImage({ container, format = 'jpeg', backgroundColor = '#ffffff', filename }) {
  const root = container ?? document.querySelector('.react-flow');
  const viewport = root?.querySelector('.react-flow__viewport');
  if (!viewport) throw new Error('No diagram found to export.');

  const nodeEls = viewport.querySelectorAll('.react-flow__node');
  if (nodeEls.length === 0) throw new Error('Nothing to export — the diagram is empty.');

  const { minX, minY, maxX, maxY } = measureFlowBounds(nodeEls);
  const width = Math.ceil(maxX - minX) + PADDING * 2;
  const height = Math.ceil(maxY - minY) + PADDING * 2;

  const capture = format === 'svg' ? toSvg : toJpeg;
  const dataUrl = await capture(viewport, {
    ...(format === 'jpeg' ? { quality: 0.95 } : {}),
    backgroundColor,
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
}
