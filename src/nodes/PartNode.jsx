import { useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useModelStore, getProtocolById } from '../store/modelStore';
import { useCapsuleStructureStore } from '../store/capsuleStructureStore';

const HEADER_HEIGHT = 33;
const ROW_HEIGHT     = 22;

// Stable references for "nothing yet" fallbacks — a fresh [] or {} literal on
// every selector call breaks React's snapshot-stability check and causes an
// infinite re-render loop.
const EMPTY_CONNECTORS = [];
const EMPTY_ROWS = {};

// A capsule instance ("part") in the structure diagram — one named Handle per
// port, so connectors can be dragged between specific ports rather than the
// generic directional handles ObjectNode uses for attribute links.
//
// Two things are computed dynamically rather than fixed by the port's index
// in the class's port list:
// - side (left/right): whichever side currently faces the port's connected
//   partner (recomputed live from canvas positions), so a wire runs straight
//   across instead of looping around the box.
// - row (vertical slot): assigned once per rebuild via capsuleStructureStore's
//   computePortRows, which puts both ends of a connector on the same row —
//   so a reciprocal pair of connectors between the same two parts renders as
//   flat, parallel lines instead of crossing in an X.
// Unconnected ports fall back to alternating sides / their row's parity.
export default function PartNode({ id, data, selected }) {
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
  const portRows = data?.portRows ?? EMPTY_ROWS;

  const thisPos = nodes.find((n) => n.id === id)?.position;

  const rowFor = (port, i) => portRows[port.id] ?? i;

  const sideFor = (port, i) => {
    const conn = connectors.find((c) =>
      (c.sourceObjectId === id && c.sourcePortId === port.id) ||
      (c.targetObjectId === id && c.targetPortId === port.id));
    if (conn && thisPos) {
      const otherId = conn.sourceObjectId === id ? conn.targetObjectId : conn.sourceObjectId;
      const otherPos = nodes.find((n) => n.id === otherId)?.position;
      if (otherPos) return otherPos.x < thisPos.x ? 'left' : 'right';
    }
    return rowFor(port, i) % 2 === 0 ? 'left' : 'right';
  };

  if (!obj || !cls) return null;

  // Compute each port's side/row once per render and reuse for both the
  // label row and its Handle, instead of recomputing (each an O(connectors +
  // nodes) scan) twice per port.
  const portLayout = ports.map((port, i) => ({ port, side: sideFor(port, i), row: rowFor(port, i) }));

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

      <div style={{
        borderTop: '1px solid var(--iml-border)', position: 'relative',
        height: Math.max(ports.length, 1) * ROW_HEIGHT,
      }}>
        {portLayout.length === 0 ? (
          <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' }}>
            no ports
          </div>
        ) : (
          portLayout.map(({ port, side, row }) => {
            return (
              <div key={port.id} style={{
                position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT,
                boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                padding: side === 'left' ? '0 10px 0 16px' : '0 16px 0 10px',
                justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
                color: '#e2e8f0', fontSize: 12,
              }}>
                <span>{port.conjugated ? `~${port.name}` : port.name}</span>
              </div>
            );
          })
        )}
      </div>

      {portLayout.map(({ port, side, row }) => {
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            className="part-port-handle"
            position={side === 'left' ? Position.Left : Position.Right}
            style={{ ...handleStyle(port.conjugated), top: HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2 }}
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
