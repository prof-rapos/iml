import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import ModelCanvas from './ModelCanvas';
import StateMachineCanvas from './behaviour/StateMachineCanvas';
import CapsuleStructureCanvas from './behaviour/CapsuleStructureCanvas';
import SETFlowCanvas from './mbt/SETFlowCanvas';
import { useModelStore } from '../store/modelStore';
import { useBehaviourStore } from '../store/behaviourStore';
import { buildSET } from '../utils/symbolicExecution';
import { layoutTree } from '../utils/treeLayout';
import { toFlowNodesEdges } from '../store/mbtStore';
import { captureFlowImageDataUrl } from '../utils/exportDiagramImage';

// A background batch operation, not a live interaction — speed doesn't
// matter here, correctness does. A fixed settle delay (rather than polling
// React Flow's own measurement state from outside its ReactFlowProvider,
// which would need extra plumbing per canvas) is simple and, empirically,
// generous enough for a data swap + fitView to fully settle.
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

// Off-screen rendering rig for the "Generate Report" pipeline (see
// generateFullReport.js) — mounts the SAME diagram components the live app
// uses (ModelCanvas, StateMachineCanvas, CapsuleStructureCanvas), not a
// parallel renderer, so a report diagram is pixel-for-pixel what the user
// would see live. Meant to be mounted into a throwaway React root created
// just for one report generation (see mountReportRenderHost in
// generateFullReport.js), NOT part of the main app tree — it never
// competes with whatever the user is actually looking at.
//
// All four canvases stay mounted simultaneously for the host's whole
// lifetime (simpler than swapping component trees per capture) — each has
// its own ReactFlowProvider and its own ref'd wrapper div, since
// captureFlowImageDataUrl needs an explicit container to query within
// (there are 4 `.react-flow` roots in this one hidden host at once, so the
// "just grab the first .react-flow on the page" default wouldn't work
// here). Composite Structure mirrors modelStore's own currentIMIndex via
// its own reactive subscription (same as the live app), so driving
// switchInstanceModel once is enough to ready BOTH the instance-model view
// and the composite-structure view for that instance model.
const ReportRenderHost = forwardRef(function ReportRenderHost(_, ref) {
  const [setData, setSetData] = useState({ nodes: [], edges: [] });
  const modelContainerRef = useRef(null);
  const structureContainerRef = useRef(null);
  const smContainerRef = useRef(null);
  const setContainerRef = useRef(null);

  const setMode = useModelStore((s) => s.setMode);
  const switchInstanceModel = useModelStore((s) => s.switchInstanceModel);
  const setCapsule = useBehaviourStore((s) => s.setCapsule);

  useImperativeHandle(ref, () => ({
    async captureMetaModel() {
      setMode('metamodel');
      await settle();
      return captureFlowImageDataUrl({ container: modelContainerRef.current });
    },
    async captureInstanceModel(imIndex) {
      setMode('instance');
      switchInstanceModel(imIndex);
      await settle();
      return captureFlowImageDataUrl({ container: modelContainerRef.current });
    },
    async captureCompositeStructure(imIndex) {
      switchInstanceModel(imIndex);
      await settle();
      return captureFlowImageDataUrl({ container: structureContainerRef.current });
    },
    async captureStateMachine(capsuleId) {
      setCapsule(capsuleId);
      await settle();
      return captureFlowImageDataUrl({ container: smContainerRef.current });
    },
    async captureSET(capsuleId, metaModel) {
      const setResult = buildSET(capsuleId, metaModel);
      const positions = layoutTree(setResult);
      const { nodes, edges } = toFlowNodesEdges(setResult, positions);
      setSetData({ nodes, edges });
      await settle();
      return captureFlowImageDataUrl({ container: setContainerRef.current });
    },
  }));

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', left: -99999, top: 0, width: 1600, height: 1200, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <div ref={modelContainerRef} style={{ width: '100%', height: '100%' }}>
        <ReactFlowProvider><ModelCanvas /></ReactFlowProvider>
      </div>
      <div ref={structureContainerRef} style={{ width: '100%', height: '100%' }}>
        <ReactFlowProvider><CapsuleStructureCanvas /></ReactFlowProvider>
      </div>
      <div ref={smContainerRef} style={{ width: '100%', height: '100%' }}>
        <ReactFlowProvider><StateMachineCanvas /></ReactFlowProvider>
      </div>
      <div ref={setContainerRef} style={{ width: '100%', height: '100%' }}>
        <ReactFlowProvider><SETFlowCanvas nodes={setData.nodes} edges={setData.edges} /></ReactFlowProvider>
      </div>
    </div>
  );
});

export default ReportRenderHost;
