import { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

const HEADER_HEIGHT = 33;
const ROW_HEIGHT     = 22;

const handleStyle = {
  width: 10, height: 10,
  background: '#a855f7',
  border: '2px solid #fff',
  borderRadius: '50%',
};

// A capsule instance ("part") in the structure diagram — one named Handle per
// port (alternating sides), so connectors can be dragged between specific ports
// rather than the generic directional handles ObjectNode uses for attribute links.
export default function PartNode({ id, selected }) {
  const obj = useModelStore((s) => s.instanceModels[s.currentIMIndex]?.objects.find((o) => o.id === id));
  const metaModel = useModelStore((s) => s.metaModel);
  const classId   = obj?.classId ?? '';
  const cls = useMemo(() => metaModel.classes.find((c) => c.id === classId), [classId, metaModel.classes]);
  const ports = cls?.ports ?? [];

  if (!obj || !cls) return null;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${selected ? 'var(--iml-primary)' : '#7c3aed'}`,
        borderRadius: 6,
        minWidth: 180,
        fontFamily: 'var(--iml-font-sans)',
        fontSize: 13,
        boxShadow: selected ? '0 0 0 3px rgba(124,58,237,0.2)' : '0 2px 6px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        overflow: 'visible',
        position: 'relative',
      }}
    >
      <div style={{
        height: HEADER_HEIGHT, boxSizing: 'border-box',
        background: 'var(--iml-instance-header)',
        color: '#fff',
        padding: '6px 10px',
        fontWeight: 600,
        fontSize: 13,
        display: 'flex', alignItems: 'center',
        borderRadius: '4px 4px 0 0',
      }}>
        <span>{obj.name}: </span>
        <span style={{ fontWeight: 400, opacity: 0.8, textDecoration: 'underline', marginLeft: 4 }}>{cls.name}</span>
      </div>

      <div style={{ borderTop: '1px solid var(--iml-border)' }}>
        {ports.length === 0 ? (
          <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' }}>
            no ports
          </div>
        ) : (
          ports.map((port, i) => {
            const side = i % 2 === 0 ? 'left' : 'right';
            return (
              <div key={port.id} style={{
                height: ROW_HEIGHT, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                padding: side === 'left' ? '0 10px 0 16px' : '0 16px 0 10px',
                justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
                color: '#e2e8f0', fontSize: 12, gap: 5,
              }}>
                {side === 'right' && <PortBadge conjugated={port.conjugated} />}
                <span>{port.name}</span>
                {side === 'left' && <PortBadge conjugated={port.conjugated} />}
              </div>
            );
          })
        )}
      </div>

      {ports.map((port, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={side === 'left' ? Position.Left : Position.Right}
            style={{ ...handleStyle, top: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 }}
          />
        );
      })}
    </div>
  );
}

function PortBadge({ conjugated }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
      color: conjugated ? '#fca5a5' : '#93c5fd',
      opacity: 0.85,
    }}>
      {conjugated ? '~conj' : 'base'}
    </span>
  );
}
