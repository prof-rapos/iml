import { ReactFlow, Background } from '@xyflow/react';
import SETNode from '../../nodes/SETNode';
import SETEdge from '../../edges/SETEdge';
import SvgMarkers from '../SvgMarkers';

const nodeTypes = { setNode: SETNode };
const edgeTypes = { setEdge: SETEdge };

// Presentational-only SET canvas — nodes/edges passed directly as props
// rather than read from mbtStore. Used by ReportRenderHost.jsx's headless
// capture for the "Generate Report" pipeline: mbtStore's own capsuleId/
// rebuild() flow is async-scheduled for live-UI reasons (a spinner, a
// staleness check against the current model) that don't apply to a
// one-shot batch render — simpler to just build a fresh SET (buildSET +
// layoutTree + mbtStore's own toFlowNodesEdges) and feed it straight
// through as data. Not interactive (no drag, no selection) since nothing
// here is ever actually seen by a user.
export default function SETFlowCanvas({ nodes, edges }) {
  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--iml-canvas-bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        elementsSelectable={false}
        fitView
      >
        <SvgMarkers />
        <Background color="var(--iml-grid-color)" gap={20} />
      </ReactFlow>
    </div>
  );
}
