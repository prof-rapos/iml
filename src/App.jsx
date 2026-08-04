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
import MBTView from './components/mbt/MBTView';
import { useModelStore } from './store/modelStore';
import { seedDemoModel } from './utils/seedModel';

export default function App() {
  const rebuildCanvas = useModelStore((s) => s.rebuildCanvas);
  const appView       = useModelStore((s) => s.appView);

  useEffect(() => {
    seedDemoModel();
    // seedDemoModel sets state directly (not through loadFromJSON), so it
    // doesn't get the dirty-suppression that action's own callers do —
    // reset explicitly so the demo model itself doesn't immediately read
    // as "unsaved work" the moment the app opens.
    useModelStore.setState({ dirty: false });
    setTimeout(() => rebuildCanvas('metamodel'), 50);
    // rebuildCanvas is a Zustand action (stable reference) — this still
    // only runs once, on mount.
  }, [rebuildCanvas]);

  // No autosave anywhere in the app (a known, deliberate gap — see project
  // backlog) — an accidental refresh/close otherwise silently destroys the
  // whole in-progress session with zero warning, since seedDemoModel above
  // runs unconditionally on every mount. Only warn once there's actually
  // something at risk (see the `dirty` flag's own comment in modelStore.js).
  useEffect(() => {
    const handler = (e) => {
      if (!useModelStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = ''; // required for the native confirmation prompt in most browsers
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  if (appView === 'home')            return <LandingPage />;
  if (appView === 'ide')             return <IDEView />;
  if (appView === 'transformations') return <TransformView />;
  if (appView === 'behavioural')     return <BehaviouralView />;
  if (appView === 'testing')         return <MBTView />;

  return (
    <ReactFlowProvider>
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
