import { ReactFlowProvider } from '@xyflow/react';
import { useBehaviourStore } from '../../store/behaviourStore';
import { useModelStore } from '../../store/modelStore';
import SvgMarkers from '../SvgMarkers';
import BehaviourTopbar from './BehaviourTopbar';
import BehaviourSidebar from './BehaviourSidebar';
import StateMachineCanvas from './StateMachineCanvas';
import BehaviourProperties from './BehaviourProperties';

export default function BehaviouralView() {
  const capsuleId = useBehaviourStore((s) => s.capsuleId);
  const hasClasses = useModelStore((s) => s.metaModel.classes.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'var(--iml-font-sans)' }}>
      <SvgMarkers />
      <BehaviourTopbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <BehaviourSidebar />
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <ReactFlowProvider>
            <StateMachineCanvas />
          </ReactFlowProvider>
          {!capsuleId && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.8,
            }}>
              <div>
                {hasClasses
                  ? <>Select a <strong>capsule</strong> (class) in the toolbar<br />to model its state machine.</>
                  : <>No classes yet — build a meta-model in<br /><strong>Structural Modeling</strong> first, then return here.</>}
              </div>
            </div>
          )}
        </div>
        <BehaviourProperties />
      </div>
    </div>
  );
}
