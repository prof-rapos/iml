import { useEffect } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useStore, useStoreApi, getViewportForBounds } from '@xyflow/react';
import { useModelStore } from '../../store/modelStore';
import { useMbtStore } from '../../store/mbtStore';
import { hasStateMachine } from '../../utils/javaCodeGen';
import SETNode from '../../nodes/SETNode';
import SETEdge from '../../edges/SETEdge';
import SvgMarkers from '../SvgMarkers';
import SETLegend from './SETLegend';
import { TEXT, TEXT_DIM } from '../theme';

const nodeTypes = { setNode: SETNode };
const edgeTypes = { setEdge: SETEdge };
const BORDER = 'rgba(255,255,255,0.10)';
const TOP_MARGIN = 70; // px the root sits below the pane's top edge once centered
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2; // matches ReactFlow's own un-overridden defaults

const MAX_MEASURE_RETRIES = 120; // ~2s at 60fps — a several-hundred-node tree's measurement pass can take a while to fully settle

// Runs once per fresh build (keyed off buildToken, not `nodes` itself — the
// store's nodes array mutates repeatedly during React Flow's own per-node
// measurement pass, which isn't a new build and shouldn't re-trigger this).
// Deliberately does NOT call fitView(): fitView commits its own viewport
// asynchronously (even with duration:0), so a follow-up getViewport()/
// setViewport() pair in the same tick can read stale values and then get
// clobbered when fitView's own update lands after ours. Computing the
// target viewport in one pure pass and calling setViewport() exactly once
// removes that race.
//
// A second, separate race: on the very first frames after a build, React
// Flow's nodes haven't all been measured yet (ResizeObserver reports each
// node's real width/height back through onNodesChange progressively, not
// atomically) — computing bounds from a mix of measured and not-yet-
// measured nodes produces a PARTIAL bounding box, not a zero-size one, so
// merely checking "is width/height nonzero" isn't enough. Now waits for
// every node in this build to actually be measured (checked directly
// against React Flow's internal nodeLookup via useStoreApi) before
// computing anything, retrying on the next frame until then (capped).
//
// A THIRD bug, found via a real large/asymmetric tree (TreeDemo.iml.json,
// 1261 nodes): treeLayout.js's root x is "the average of its children's
// slots, recursively" — for a genuinely lopsided tree this can land far
// from the tree's overall bounding-box CENTER (observed: root at x=127258
// while the tree's bounds spanned 0..138600 — nowhere near the midpoint).
// Centering the viewport on the whole tree's bounding box (matching what
// fitView itself does, and what this component did through both earlier
// fix attempts) put the ROOT itself thousands of pixels outside the
// visible pane, even though its OWN y was correctly placed near the top —
// it was just off-screen sideways. The fix is to stop centering the tree's
// bounding box at all: zoom still comes from fitting the whole tree's
// width/height into the pane (so the initial view is still a sensible,
// zoomed-out "here's how big this is"), but x/y are computed directly from
// the ROOT's own position, not the box's center — that's what "center the
// root" actually means, and it holds regardless of how asymmetric the tree
// is.
//
// A FOURTH bug, from a pre-alpha code review: `root` itself is read from
// the closure-captured `nodes` snapshot (necessarily from before this
// build's measurement pass, per the second bug above), so `root.measured`
// is permanently undefined even after `allMeasured()` confirms every node
// IS measured — silently falling back to the hardcoded 150px default width
// for every real node instead. Fixed by reading the root's width from the
// live nodeLookup (the same source allMeasured() already uses), not from
// the stale snapshot.
function SETViewportController({ buildToken, rootId, nodes }) {
  const { setViewport, getNodesBounds } = useReactFlow();
  const store = useStoreApi();
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);

  useEffect(() => {
    if (!rootId || nodes.length === 0 || !paneWidth || !paneHeight) return;
    let raf;

    function allMeasured() {
      const { nodeLookup } = store.getState();
      for (const n of nodes) {
        const internal = nodeLookup.get(n.id);
        if (!internal?.measured?.width || !internal?.measured?.height) return false;
      }
      return true;
    }

    function attempt(retriesLeft) {
      const root = nodes.find((n) => n.id === rootId);
      if (!root) return;
      if (!allMeasured() && retriesLeft > 0) {
        raf = requestAnimationFrame(() => attempt(retriesLeft - 1));
        return;
      }
      const bounds = getNodesBounds(nodes);
      const { zoom } = getViewportForBounds(bounds, paneWidth, paneHeight, MIN_ZOOM, MAX_ZOOM, 0.15);
      // root itself comes from the closure-captured `nodes` snapshot (see
      // the comment above), which is always from BEFORE measurement — its
      // own .measured is permanently undefined even once allMeasured() is
      // true. Read the width from the live nodeLookup instead, the same
      // source allMeasured() already uses, so this doesn't silently fall
      // back to the 150px default for every real (usually wider) node.
      const rootWidth = store.getState().nodeLookup.get(rootId)?.measured?.width ?? 150;
      const x = paneWidth / 2 - (root.position.x + rootWidth / 2) * zoom;
      const y = TOP_MARGIN - root.position.y * zoom;
      setViewport({ x, y, zoom }, { duration: 250 });
    }

    raf = requestAnimationFrame(() => attempt(MAX_MEASURE_RETRIES));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildToken, paneWidth, paneHeight]);

  return null;
}

function Spinner() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--iml-primary)',
      animation: 'iml-spin 0.8s linear infinite',
    }} />
  );
}

export default function SETViewerPanel() {
  const classes    = useModelStore((s) => s.metaModel.classes);
  const metaModel  = useModelStore((s) => s.metaModel);
  const capsuleId     = useMbtStore((s) => s.capsuleId);
  const setCapsule    = useMbtStore((s) => s.setCapsule);
  const rebuild        = useMbtStore((s) => s.rebuild);
  const nodes         = useMbtStore((s) => s.nodes);
  const edges         = useMbtStore((s) => s.edges);
  const onNodesChange = useMbtStore((s) => s.onNodesChange);
  const building       = useMbtStore((s) => s.building);
  const buildToken     = useMbtStore((s) => s.buildToken);
  const setResult      = useMbtStore((s) => s.setResult);

  const capsuleClasses = classes.filter((c) => hasStateMachine(c, metaModel));

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${BORDER}`, overflow: 'hidden',
    }}>
      <style>{'@keyframes iml-spin { to { transform: rotate(360deg); } }'}</style>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: TEXT_DIM }}>Capsule</span>
        <select
          value={capsuleId ?? ''}
          onChange={(e) => setCapsule(e.target.value || null)}
          disabled={capsuleClasses.length === 0}
          style={{
            background: '#21262d', border: `1px solid ${BORDER}`, color: '#e6edf3',
            borderRadius: 5, padding: '5px 8px', fontSize: 12,
            cursor: capsuleClasses.length === 0 ? 'default' : 'pointer', minWidth: 160,
            opacity: capsuleClasses.length === 0 ? 0.5 : 1,
          }}
        >
          <option value="">{capsuleClasses.length === 0 ? '— no capsules with a state machine —' : '— select a class —'}</option>
          {capsuleClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={rebuild}
          disabled={!capsuleId || building}
          title="Rebuild the tree — e.g. after editing this capsule's state machine elsewhere"
          style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_DIM,
            borderRadius: 5, padding: '5px 8px', fontSize: 12,
            cursor: (!capsuleId || building) ? 'default' : 'pointer',
            opacity: (!capsuleId || building) ? 0.4 : 1,
          }}
        >
          ⟳ Rebuild
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', background: 'var(--iml-canvas-bg)' }}>
        {building ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
            alignItems: 'center', justifyContent: 'center',
            color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)',
          }}>
            <Spinner />
            <span>Building symbolic execution tree…</span>
          </div>
        ) : capsuleId ? (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
            >
              <SETViewportController buildToken={buildToken} rootId={setResult?.rootId} nodes={nodes} />
              <SvgMarkers />
              <Background color="var(--iml-grid-color)" gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <SETLegend />
          </ReactFlowProvider>
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
            justifyContent: 'center', textAlign: 'center', padding: 24,
            color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)',
          }}>
            {capsuleClasses.length === 0 ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>No capsule has a state machine yet</div>
                <div style={{ maxWidth: 320, lineHeight: 1.6 }}>
                  Model-Based Testing explores a capsule's state machine — build one first in the Behavioural Modeling module (give a class ports and at least one state), then come back here.
                </div>
              </>
            ) : (
              'Select a capsule (class) above to build its symbolic execution tree.'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
