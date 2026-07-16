import { TEXT_DIM } from '../theme';

const BORDER   = 'rgba(255,255,255,0.10)';

const sectionHeader = {
  padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: TEXT_DIM,
  textTransform: 'uppercase', letterSpacing: '0.06em',
};
const note = { margin: '0 12px 12px', fontSize: 11, color: TEXT_DIM, lineHeight: 1.6 };

function Legend({ conjugated, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 12px 4px', fontSize: 11 }}>
      <span style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
        color: conjugated ? '#fca5a5' : '#93c5fd',
      }}>
        {conjugated ? '~conj' : 'base'}
      </span>
      <span style={{ color: TEXT_DIM }}>{label}</span>
    </div>
  );
}

// Info/legend panel for the capsule Structure sub-view — no palette here since
// parts come from Structural Modeling's Instance tab, not a "add part" action.
export default function CapsuleStructureSidebar() {
  return (
    <div style={{
      width: 200, flexShrink: 0, background: '#1e293b', borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column', fontFamily: 'var(--iml-font-sans)', overflowY: 'auto',
    }}>
      <div style={sectionHeader}>Structure</div>
      <div style={note}>
        Drag between two ports to connect them. Parts are this instance model's objects — add or rename them in <strong>Structural Modeling</strong>'s Instance tab.
      </div>

      <div style={sectionHeader}>Port legend</div>
      <Legend conjugated={false} label="as declared on the class" />
      <Legend conjugated={true} label="conjugated (roles flipped)" />

      <div style={note}>
        A connector must join a base port to a conjugate port of the same protocol. Service ports (Timing, Log) connect to the runtime, not to other parts, so they aren't shown here.
      </div>
    </div>
  );
}
