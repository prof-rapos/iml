import { useModelStore, getProtocolById } from '../../store/modelStore';
import { useCapsuleStructureStore } from '../../store/capsuleStructureStore';

const PANEL_BG   = '#0f172a';
const HEADER_BG  = '#1e293b';
const BORDER     = 'rgba(255,255,255,0.1)';
const TEXT       = '#f1f5f9';
const TEXT_MUTED = 'rgba(255,255,255,0.45)';

const panelStyle = {
  width: 260, background: PANEL_BG, borderLeft: `1px solid ${BORDER}`,
  display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', color: TEXT,
  fontFamily: 'var(--iml-font-sans)',
};
const headerStyle = {
  padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 13,
  background: HEADER_BG, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};

function DeleteBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)',
      borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    }}>Delete</button>
  );
}

// Endpoint label: "ObjectName.portName"
function endpointLabel(im, metaModel, objectId, portId) {
  const obj = im?.objects.find((o) => o.id === objectId);
  const cls = metaModel.classes.find((c) => c.id === obj?.classId);
  const port = (cls?.ports ?? []).find((p) => p.id === portId);
  return `${obj?.name ?? '?'}.${port?.name ?? '?'}`;
}

export default function CapsuleStructureProperties() {
  const metaModel      = useModelStore((s) => s.metaModel);
  const instanceModels = useModelStore((s) => s.instanceModels);
  const currentIMIndex = useModelStore((s) => s.currentIMIndex);
  const selectedId     = useCapsuleStructureStore((s) => s.selectedId);
  const selectedType   = useCapsuleStructureStore((s) => s.selectedType);
  const deleteSelected = useCapsuleStructureStore((s) => s.deleteSelected);

  const im = instanceModels[currentIMIndex];
  const connector = selectedType === 'edge' ? (im?.connectors ?? []).find((c) => c.id === selectedId) : null;

  if (!connector) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Properties</div>
        <div style={{ padding: 16, color: TEXT_MUTED, fontSize: 13, fontStyle: 'italic', lineHeight: 1.7 }}>
          Click a connector to edit it. Parts come from this instance model's objects — add them in Structural Modeling's Instance tab.
        </div>
      </div>
    );
  }

  const srcObj  = im.objects.find((o) => o.id === connector.sourceObjectId);
  const srcCls  = metaModel.classes.find((c) => c.id === srcObj?.classId);
  const srcPort = (srcCls?.ports ?? []).find((p) => p.id === connector.sourcePortId);
  const proto   = srcPort ? getProtocolById(srcPort.protocolId, metaModel) : null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Connector</span>
        <DeleteBtn onClick={deleteSelected} />
      </div>
      <div style={{ padding: 16, fontSize: 13, lineHeight: 2 }}>
        <div><span style={{ color: TEXT_MUTED }}>From:</span> {endpointLabel(im, metaModel, connector.sourceObjectId, connector.sourcePortId)}</div>
        <div><span style={{ color: TEXT_MUTED }}>To:</span> {endpointLabel(im, metaModel, connector.targetObjectId, connector.targetPortId)}</div>
        <div><span style={{ color: TEXT_MUTED }}>Protocol:</span> «{proto?.name ?? '?'}»</div>
      </div>
    </div>
  );
}
