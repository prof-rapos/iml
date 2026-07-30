import { STATUS_BORDER, STATUS_LABEL } from '../../utils/setNodeStatus';
import { TEXT_DIM } from '../theme';

// Node statuses worth explaining — 'open' nodes look like an ordinary
// capsule-diagram node (no dashed border, no badge) and are self-evident,
// so the legend only covers the four leaf outcomes the user actually needs
// a key for.
const ROWS = [
  { status: 'leaf-deadend', desc: 'no outgoing trigger from here' },
  { status: 'leaf-final', desc: 'capsule reaches its Final state' },
  { status: 'leaf-subsumed', desc: 'loops back to an already-explored state', dashed: true },
  { status: 'leaf-depth-bound', desc: 'exploration depth limit reached', dashed: true },
];

export default function SETLegend() {
  return (
    <div style={{
      position: 'absolute', left: 10, bottom: 10, zIndex: 5,
      background: 'rgba(22,27,34,0.92)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5,
      fontFamily: 'var(--iml-font-sans)', pointerEvents: 'none',
    }}>
      {ROWS.map(({ status, desc, dashed }) => (
        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 3, flexShrink: 0,
            border: `2px ${dashed ? 'dashed' : 'solid'} ${STATUS_BORDER[status]}`,
          }} />
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            <strong style={{ color: STATUS_BORDER[status], fontWeight: 600 }}>{STATUS_LABEL[status]}</strong>
            {' — '}{desc}
          </span>
        </div>
      ))}
    </div>
  );
}
