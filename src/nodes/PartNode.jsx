import { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useModelStore, getProtocolById } from '../store/modelStore';
import { useCapsuleStructureStore } from '../store/capsuleStructureStore';

const HEADER_HEIGHT = 33;
const ROW_HEIGHT     = 22;

// Stable reference for the "no instance model yet" fallback — a fresh []
// literal on every selector call breaks React's snapshot-stability check
// and causes an infinite re-render loop.
const EMPTY_CONNECTORS = [];

// A capsule instance ("part") in the structure diagram — one named Handle per
// port, so connectors can be dragged between specific ports rather than the
// generic directional handles ObjectNode uses for attribute links. A
// connected port renders on whichever side currently faces its partner part
// (recomputed live from canvas positions) so a reciprocal pair of connectors
// between the same two parts runs as two clean parallel lines instead of one
// looping all the way around; unconnected ports fall back to alternating sides.
export default function PartNode({ id, selected }) {
  const obj = useModelStore((s) => s.instanceModels[s.currentIMIndex]?.objects.find((o) => o.id === id));
  const metaModel = useModelStore((s) => s.metaModel);
  const connectors = useModelStore((s) => s.instanceModels[s.currentIMIndex]?.connectors ?? EMPTY_CONNECTORS);
  const nodes = useCapsuleStructureStore((s) => s.nodes);
  const classId = obj?.classId ?? '';
  const cls = useMemo(() => metaModel.classes.find((c) => c.id === classId), [classId, metaModel.classes]);
  // Service ports (Timing, Log, ...) connect to the runtime, not to other
  // parts — only user-defined-protocol ports are wireable here.
  const ports = useMemo(
    () => (cls?.ports ?? []).filter((p) => !getProtocolById(p.protocolId, metaModel)?.system),
    [cls, metaModel],
  );

  const thisPos = nodes.find((n) => n.id === id)?.position;

  const sideFor = (port, i) => {
    const conn = connectors.find((c) =>
      (c.sourceObjectId === id && c.sourcePortId === port.id) ||
      (c.targetObjectId === id && c.targetPortId === port.id));
    if (conn && thisPos) {
      const otherId = conn.sourceObjectId === id ? conn.targetObjectId : conn.sourceObjectId;
      const otherPos = nodes.find((n) => n.id === otherId)?.position;
      if (otherPos) return otherPos.x < thisPos.x ? 'left' : 'right';
    }
    return i % 2 === 0 ? 'left' : 'right';
  };

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
            const side = sideFor(port, i);
            return (
              <div key={port.id} style={{
                height: ROW_HEIGHT, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                padding: side === 'left' ? '0 10px 0 16px' : '0 16px 0 10px',
                justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
                color: '#e2e8f0', fontSize: 12, gap: 6,
              }}>
                {side === 'right' && <PortMarker conjugated={port.conjugated} />}
                <span>{port.name}</span>
                {side === 'left' && <PortMarker conjugated={port.conjugated} />}
              </div>
            );
          })
        )}
      </div>

      {ports.map((port, i) => {
        const side = sideFor(port, i);
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={side === 'left' ? Position.Left : Position.Right}
            style={{ ...handleStyle(port.conjugated), top: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 }}
          />
        );
      })}
    </div>
  );
}

// Matches the notation other UML-RT tools use: a filled square for a base
// port, a hollow (white) square for a conjugated one.
function handleStyle(conjugated) {
  return {
    width: 10, height: 10, borderRadius: 2,
    background: conjugated ? '#fff' : '#111',
    border: '2px solid #7c3aed',
  };
}

function PortMarker({ conjugated }) {
  return (
    <span
      title={conjugated ? 'conjugated' : 'base'}
      style={{
        width: 8, height: 8, borderRadius: 1.5, flexShrink: 0,
        background: conjugated ? '#fff' : '#111',
        border: '1.5px solid #a855f7',
      }}
    />
  );
}
