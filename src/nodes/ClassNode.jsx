import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

const VISIBILITY = { PUBLIC: '+', PRIVATE: '-', PROTECTED: '#' };

const handleStyle = {
  width: 10, height: 10,
  background: '#2563eb',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function ClassNode({ id, selected }) {
  const cls = useModelStore((s) => s.metaModel.classes.find((c) => c.id === id));

  if (!cls) return null;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${selected ? 'var(--iml-primary)' : 'var(--iml-node-border)'}`,
        borderRadius: 6,
        minWidth: 160,
        fontFamily: 'var(--iml-font-sans)',
        fontSize: 13,
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 2px 6px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        background: cls.isAbstract ? 'var(--iml-secondary)' : 'var(--iml-node-header)',
        color: '#fff',
        padding: '6px 10px',
        fontWeight: 600,
        fontSize: 13,
        textAlign: 'center',
      }}>
        {cls.isAbstract
          ? <span style={{ fontStyle: 'italic' }}>«{cls.name}»</span>
          : cls.name
        }
      </div>

      {/* Attributes */}
      <div style={{ padding: '4px 0', borderTop: '1px solid var(--iml-border)' }}>
        {cls.attributes.length === 0 ? (
          <div style={{ padding: '4px 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' }}>
            no attributes
          </div>
        ) : (
          cls.attributes.map((a) => (
            <div key={a.id} style={{ padding: '2px 10px', color: '#e2e8f0', fontSize: 12 }}>
              {VISIBILITY[a.visibility] || '+'} {a.name} : {a.type}
              <span style={{ color: 'rgb(147, 197, 253)' }}>
                {' '}[{a.lowerBound}..{a.upperBound === -1 ? '*' : a.upperBound}]
              </span>
            </div>
          ))
        )}
      </div>

      {/* Handles on all 4 sides — each side has both source+target so direction is determined by drag order */}
      <Handle id="right"  type="source" position={Position.Right}  style={{ ...handleStyle, right:  -6 }} />
      <Handle id="left"   type="source" position={Position.Left}   style={{ ...handleStyle, left:   -6 }} />
      <Handle id="top"    type="source" position={Position.Top}    style={{ ...handleStyle, top:    -6 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -6 }} />
    </div>
  );
}
