import { useTransformStore } from '../../store/transformStore';
import TransformTopbar from './TransformTopbar';
import ModelPanel from './ModelPanel';
import RuleEditor from './RuleEditor';

const TEXT   = '#e6edf3';
const BORDER = 'rgba(255,255,255,0.10)';

export default function TransformView() {
  const { source, target, result } = useTransformStore();

  const totalGenerated = result
    ? result.instanceModels.reduce((n, im) => n + im.objects.length, 0)
    : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d1117', color: TEXT,
      fontFamily: 'var(--iml-font-sans)',
    }}>
      <TransformTopbar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: source model */}
        <ModelPanel label="Source Model" data={source} side="source" />

        {/* Center: rule editor */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}` }}>
          <RuleEditor />
        </div>

        {/* Right: target model */}
        <ModelPanel label="Target Model" data={target} side="target" />
      </div>

      {/* Result notification */}
      {result && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900,
          background: '#161b22',
          border: '1px solid rgba(63,185,80,0.5)',
          borderRadius: 8, padding: '10px 20px',
          fontSize: 13, color: '#3fb950',
          fontFamily: 'var(--iml-font-sans)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          ✓ Transformation complete — {totalGenerated} object{totalGenerated !== 1 ? 's' : ''} generated across {result.instanceModels.length} instance model{result.instanceModels.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
