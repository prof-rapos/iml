import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ModelCanvas from './components/ModelCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import LandingPage from './components/LandingPage';
import Notification from './components/Notification';
import IDEView from './components/ide/IDEView';
import TransformView from './components/transform/TransformView';
import BehaviouralView from './components/behaviour/BehaviouralView';
import { useModelStore } from './store/modelStore';
import { seedDemoModel } from './utils/seedModel';

// SVG marker definitions — referenced by edge components as url(#id)
function SvgDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {/*
          Composition filled diamond — placed at the SOURCE end (markerStart).
          viewBox: 0 0 20 10  — 20 wide, 10 tall
          refX=0, refY=5      — the LEFT TIP of the diamond attaches to the path start
          orient="auto"       — rotates to match edge direction
          The edge line starts at refX/refY and the diamond extends INTO the path,
          covering the line start with its filled body.
        */}
        <marker
          id="diamond-composition"
          viewBox="0 0 20 10"
          refX="1" refY="5"
          markerWidth="20" markerHeight="15"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="1,5 10,0.5 19,5 10,9.5" fill="#000000" stroke="#000000" strokeWidth="1.5" />
        </marker>

        {/* Inheritance: hollow triangle — white fill, black border */}
        <marker
          id="arrow-inheritance"
          viewBox="0 0 18 16"
          refX="18" refY="8"
          markerWidth="18" markerHeight="16"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0,0 18,8 0,16" fill="white" stroke="black" strokeWidth="1.5" />
        </marker>

        {/* Reference / Composition: open black arrowhead */}
        <marker
          id="arrow-open"
          viewBox="0 0 12 12"
          refX="11" refY="6"
          markerWidth="14" markerHeight="14"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 11 6 L 0 11" fill="none" stroke="black" strokeWidth="2" />
        </marker>
      </defs>
    </svg>
  );
}

export default function App() {
  const rebuildCanvas = useModelStore((s) => s.rebuildCanvas);
  const appView       = useModelStore((s) => s.appView);

  useEffect(() => {
    seedDemoModel();
    setTimeout(() => rebuildCanvas('metamodel'), 50);
  }, []);

  if (appView === 'home')            return <LandingPage />;
  if (appView === 'ide')             return <IDEView />;
  if (appView === 'transformations') return <TransformView />;
  if (appView === 'behavioural')     return <BehaviouralView />;

  return (
    <ReactFlowProvider>
      <SvgDefs />
      <Notification />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Topbar />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <ModelCanvas />
          <PropertiesPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
