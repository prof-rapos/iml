import { ReactFlowProvider } from '@xyflow/react';
import { useBehaviourStore } from '../../store/behaviourStore';
import { useModelStore } from '../../store/modelStore';
import BehaviourTopbar from './BehaviourTopbar';
import BehaviourSidebar from './BehaviourSidebar';
import StateMachineCanvas from './StateMachineCanvas';
import BehaviourProperties from './BehaviourProperties';
import CapsuleStructureCanvas from './CapsuleStructureCanvas';
import CapsuleStructureSidebar from './CapsuleStructureSidebar';
import CapsuleStructureProperties from './CapsuleStructureProperties';
import CodeDrawer from './CodeDrawer';

export default function BehaviouralView() {
  const capsuleId  = useBehaviourStore((s) => s.capsuleId);
  const subView    = useBehaviourStore((s) => s.subView);
  const hasClasses = useModelStore((s) => s.metaModel.classes.length > 0);
  const hasParts   = useModelStore((s) => {
    const im = s.instanceModels[s.currentIMIndex];
    return !!im?.objects.some((o) => (s.metaModel.classes.find((c) => c.id === o.classId)?.ports ?? []).length > 0);
  });

  const isStructure = subView === 'structure';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'var(--iml-font-sans)' }}>
      <BehaviourTopbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isStructure ? <CapsuleStructureSidebar /> : <BehaviourSidebar />}
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <ReactFlowProvider>
            {isStructure ? <CapsuleStructureCanvas /> : <StateMachineCanvas />}
          </ReactFlowProvider>
          {isStructure ? (
            !hasParts && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.8,
              }}>
                <div>
                  No capsule instances in this instance model yet — add objects of a<br />
                  ported class in <strong>Structural Modeling</strong>&apos;s Instance tab, then return here to wire them.
                </div>
              </div>
            )
          ) : (
            !capsuleId && (
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
            )
          )}
        </div>
        {isStructure ? <CapsuleStructureProperties /> : <BehaviourProperties />}
        <CodeDrawer />
      </div>
    </div>
  );
}
