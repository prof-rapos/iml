import { AllSidesHandles } from './nodeShell';

// The final state — an outer ring around a filled centre. Transitions enter it.
const handleStyle = {
  width: 8, height: 8,
  background: '#64748b',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function FinalNode({ selected }) {
  const ring = selected ? '#d97706' : '#e2e8f0';
  return (
    <div
      style={{
        width: 26, height: 26, borderRadius: '50%',
        background: '#0f172a',
        border: `2px solid ${ring}`,
        boxShadow: selected ? '0 0 0 3px rgba(217,119,6,0.25)' : '0 2px 6px rgba(0,0,0,0.3)',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: ring }} />
      <AllSidesHandles type="target" style={handleStyle} />
    </div>
  );
}
