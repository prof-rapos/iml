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
import SvgMarkers from './components/SvgMarkers';

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
      <SvgMarkers />
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
