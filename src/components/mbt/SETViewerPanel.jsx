import { useEffect } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow, useStore, getViewportForBounds } from '@xyflow/react';
import { useModelStore } from '../../store/modelStore';
import { useMbtStore } from '../../store/mbtStore';
import { hasStateMachine } from '../../utils/javaCodeGen';
import SETNode from '../../nodes/SETNode';
import SETEdge from '../../edges/SETEdge';
import SvgMarkers from '../SvgMarkers';
import SETLegend from './SETLegend';
import { TEXT_DIM } from '../theme';

const nodeTypes = { setNode: SETNode };
const edgeTypes = { setEdge: SETEdge };
const BORDER = 'rgba(255,255,255,0.10)';
const TOP_MARGIN = 70; // px the root sits below the pane's top edge once centered
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2; // matches ReactFlow's own un-overridden defaults

// Runs once per fresh build (keyed off buildToken, not `nodes` itself — the
// store's nodes array mutates repeatedly during React Flow's own per-node
// measurement pass, which isn't a new build and shouldn't re-trigger this).
// Deliberately does NOT call fitView(): fitView commits its own viewport
// asynchronously (even with duration:0), so a follow-up getViewport()/
// setViewport() pair in the same tick can read stale values and then get
// clobbered when fitView's own update lands after ours — this is why the
// root kept ending up back at the tree's vertical center instead of the
// top. Computing the target viewport in one pure pass with
// getViewportForBounds() and calling setViewport() exactly once removes
// that race entirely: x/zoom center+fit the whole tree horizontally
// (same math fitView uses internally), and y is overridden so the root
// sits near the TOP of the pane instead of vertically centered — large
// trees otherwise bury the root (the point you'd actually start reading
// from) off-screen.
function SETViewportController({ buildToken, rootId, nodes }) {
  const { setViewport, getNodesBounds } = useReactFlow();
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);

  useEffect(() => {
    if (!rootId || nodes.length === 0 || !paneWidth || !paneHeight) return;
    const raf = requestAnimationFrame(() => {
      const root = nodes.find((n) => n.id === rootId);
      if (!root) return;
      const bounds = getNodesBounds(nodes);
      const { x, zoom } = getViewportForBounds(bounds, paneWidth, paneHeight, MIN_ZOOM, MAX_ZOOM, 0.15);
      setViewport({ x, y: TOP_MARGIN - root.position.y * zoom, zoom }, { duration: 250 });
    });
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
          style={{
            background: '#21262d', border: `1px solid ${BORDER}`, color: '#e6edf3',
            borderRadius: 5, padding: '5px 8px', fontSize: 12, cursor: 'pointer', minWidth: 160,
          }}
        >
          <option value="">— select a class —</option>
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
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', textAlign: 'center', padding: 24,
            color: TEXT_DIM, fontSize: 13, fontFamily: 'var(--iml-font-sans)',
          }}>
            Select a <strong>capsule</strong> (class) above to build its symbolic execution tree.
          </div>
        )}
      </div>
    </div>
  );
}
