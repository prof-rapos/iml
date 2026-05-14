import { Handle, Position } from '@xyflow/react';
import { useModelStore } from '../store/modelStore';

const handleStyle = {
  width: 10, height: 10,
  background: '#888888',
  border: '2px solid #fff',
  borderRadius: '50%',
};

export default function ObjectNode({ id, selected }) {
  const obj = useModelStore((s) => s.instanceModels[s.currentIMIndex]?.objects.find((o) => o.id === id));
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  if (!obj) return null;

  const issues = conformanceResults.filter((r) => r.id === id);
  const isValid = issues.length === 0;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${selected ? 'var(--iml-primary)' : isValid ? '#22c55e' : '#f59e0b'}`,
        borderRadius: 6,
        minWidth: 160,
        fontFamily: 'var(--iml-font-sans)',
        fontSize: 13,
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 2px 6px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{
        background: 'var(--iml-instance-header)',
        color: '#fff',
        padding: '6px 10px',
        fontWeight: 600,
        fontSize: 13,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{  }}>{obj.name}: </span>
          <span style={{ fontWeight: 400, opacity: 0.8, textDecoration: 'underline'}}>{obj.className}</span>
        </div>
        <span style={{
          fontSize: 11,
          background: isValid ? '#22c55e' : '#f59e0b',
          borderRadius: 10,
          padding: '1px 6px',
          flexShrink: 0,
        }}>
          {isValid ? '✓' : `⚠ ${issues.length}`}
        </span>
      </div>

      <div style={{ padding: '4px 0', borderTop: '1px solid var(--iml-border)' }}>
        {obj.slots.length === 0 ? (
          <div style={{ padding: '4px 10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic' }}>
            no attributes
          </div>
        ) : (
          obj.slots.map((sl) => {
            const isMulti = Array.isArray(sl.values);
            const display = isMulti
              ? (sl.values.filter(Boolean).join(', ') || null)
              : (sl.value || null);
            return (
              <div key={sl.attrId} style={{ padding: '2px 10px', color: '#e2e8f0', fontSize: 12 }}>
                {sl.attrName} ={' '}
                <span style={{ color: display ? '#93c5fd' : 'rgba(255,255,255,0.3)' }}>
                  {display ?? '—'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <Handle id="right"  type="source" position={Position.Right}  style={{ ...handleStyle, right:  -6 }} />
      <Handle id="left"   type="source" position={Position.Left}   style={{ ...handleStyle, left:   -6 }} />
      <Handle id="top"    type="source" position={Position.Top}    style={{ ...handleStyle, top:    -6 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -6 }} />
    </div>
  );
}
