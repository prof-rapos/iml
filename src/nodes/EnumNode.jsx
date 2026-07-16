import { useModelStore } from '../store/modelStore';
import { NodeEmptyState } from './nodeShell';

// An enumeration is a type definition, not a participant in relations,
// so it has no connection handles — attributes reference it by name.
export default function EnumNode({ id, selected }) {
  const en = useModelStore((s) => s.metaModel.enumerations?.find((e) => e.id === id));
  if (!en) return null;

  return (
    <div
      style={{
        background: 'var(--iml-node-bg)',
        border: `2px solid ${selected ? 'var(--iml-primary)' : 'var(--iml-tertiary)'}`,
        borderRadius: 6,
        minWidth: 150,
        fontFamily: 'var(--iml-font-sans)',
        fontSize: 13,
        boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 2px 6px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Header with «enumeration» stereotype */}
      <div style={{
        background: 'var(--iml-tertiary)',
        color: '#fff',
        padding: '5px 10px',
        fontWeight: 600,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        <div style={{ fontSize: 10, fontStyle: 'italic', opacity: 0.85 }}>«enumeration»</div>
        {en.name}
      </div>

      {/* Literals */}
      <div style={{ padding: '4px 0', borderTop: '1px solid var(--iml-border)' }}>
        {(en.literals ?? []).length === 0 ? (
          <NodeEmptyState>no literals</NodeEmptyState>
        ) : (
          en.literals.map((lit, i) => (
            <div key={i} style={{ padding: '2px 10px', color: '#fed7aa', fontSize: 12 }}>
              {lit}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
