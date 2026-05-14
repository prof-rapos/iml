import { useModelStore } from '../store/modelStore';

export default function BottomPanel() {
  const conformanceResults = useModelStore((s) => s.conformanceResults);
  const metaModel          = useModelStore((s) => s.metaModel);
  const instanceModel      = useModelStore((s) => s.instanceModels[s.currentIMIndex]);

  const coEvoWarnings = instanceModel.objects.flatMap((obj) => {
    const cls = metaModel.classes.find((c) => c.id === obj.classId);
    if (!cls) return [];
    const orphanSlots = obj.slots.filter((sl) => !cls.attributes.find((a) => a.id === sl.attrId));
    return orphanSlots.length > 0
      ? [`Object "${obj.name}" has ${orphanSlots.length} stale slot(s) from deleted attributes.`]
      : [];
  });

  return (
    <div style={{
      height: 140, background: '#f8fafc',
      borderTop: '1px solid var(--iml-border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        padding: '5px 14px', background: '#f1f5f9',
        borderBottom: '1px solid var(--iml-border)',
        fontSize: 11, fontWeight: 700, color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Conformance
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px', fontFamily: 'var(--iml-font-mono)', fontSize: 12 }}>
        {coEvoWarnings.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#1d4ed8' }}>
            <strong>Co-evolution note:</strong>
            {coEvoWarnings.map((w, i) => <div key={i}>↳ {w}</div>)}
          </div>
        )}

        {conformanceResults.length === 0
          ? <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ No conformance issues.</span>
          : conformanceResults.map((r, i) => (
              <div key={i} style={{ color: '#dc2626', marginBottom: 4 }}>⚠ {r.msg}</div>
            ))
        }
      </div>
    </div>
  );
}
