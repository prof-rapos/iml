import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ModelCanvas from './components/ModelCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import LandingPage from './components/LandingPage';
import Notification from './components/Notification';
import RestorePrompt from './components/RestorePrompt';
import IDEView from './components/ide/IDEView';
import TransformView from './components/transform/TransformView';
import BehaviouralView from './components/behaviour/BehaviouralView';
import MBTView from './components/mbt/MBTView';
import { useModelStore } from './store/modelStore';
import { readAutosave, clearAutosave } from './utils/autosave';

export default function App() {
  const rebuildCanvas = useModelStore((s) => s.rebuildCanvas);
  const appView       = useModelStore((s) => s.appView);
  const loadFromJSON  = useModelStore((s) => s.loadFromJSON);

  // Read once, during the initial render (a lazy useState initializer, not
  // an effect) — a pure synchronous read of localStorage, no different from
  // seeding a form field from a prop. Only offer to restore when the
  // snapshot's own `dirty` flag was true — i.e. there really was unsaved
  // work at the moment of the last reload/crash, not just a stale-but-clean
  // autosave left over from a deliberate load/Clear (which resets dirty to
  // false, the same signal the beforeunload warning already uses).
  const [restorable, setRestorable] = useState(() => {
    const saved = readAutosave();
    return saved && saved.dirty ? saved : null;
  });

  // The store already initializes to an empty meta-model/instance-model by
  // default — no demo model is seeded. Still need to rebuild the canvas once
  // on mount so `nodes`/`edges` are freshly derived (matters if a stale
  // autosave-restore-declined path leaves them out of sync).
  const startFresh = () => {
    useModelStore.setState({ dirty: false });
    setTimeout(() => rebuildCanvas('metamodel'), 50);
  };

  useEffect(() => {
    // Deferred until the restore prompt resolves, so a rebuild against the
    // empty default state can't flash in behind the modal.
    if (!restorable) startFresh();
    // rebuildCanvas/startFresh are stable Zustand-action-derived references,
    // and `restorable` is only ever read here at its initial mount value
    // (both branches below already set it to null before anything could
    // re-run this) — this still only ever runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = () => {
    loadFromJSON({ metaModel: restorable.metaModel, instanceModels: restorable.instanceModels, layouts: restorable.layouts });
    setRestorable(null);
  };
  const handleDiscard = () => {
    clearAutosave();
    setRestorable(null);
    startFresh();
  };

  // beforeunload only prevents an accidental refresh from happening
  // silently — it doesn't stop the user from confirming it anyway, and
  // can't help at all against an actual crash. The autosave snapshot above
  // (and RestorePrompt below) is the backstop for those two cases; only
  // warn once there's actually something at risk (see the `dirty` flag's
  // own comment in modelStore.js).
  useEffect(() => {
    const handler = (e) => {
      if (!useModelStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = ''; // required for the native confirmation prompt in most browsers
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const view =
    appView === 'home'            ? <LandingPage /> :
    appView === 'ide'             ? <IDEView /> :
    appView === 'transformations' ? <TransformView /> :
    appView === 'behavioural'     ? <BehaviouralView /> :
    appView === 'testing'         ? <MBTView /> :
    (
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

  return (
    <>
      {view}
      {restorable && (
        <RestorePrompt savedAt={restorable.savedAt} onRestore={handleRestore} onDiscard={handleDiscard} />
      )}
    </>
  );
}
