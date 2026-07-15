import { useModelStore, getProtocolById, getPortByEndpoint } from '../../store/modelStore';
import { useCapsuleStructureStore } from '../../store/capsuleStructureStore';
import { TEXT_MUTED, panelStyle, headerStyle } from '../panelShellTokens';
import { DeleteBtn } from '../panelShell';

// Endpoint label: "ObjectName.portName"
function endpointLabel(im, metaModel, objectId, portId) {
  const obj = im?.objects.find((o) => o.id === objectId);
  const port = getPortByEndpoint(metaModel, im?.objects ?? [], objectId, portId);
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

  const srcPort = getPortByEndpoint(metaModel, im.objects, connector.sourceObjectId, connector.sourcePortId);
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
