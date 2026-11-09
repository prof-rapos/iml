// Flattens a meta-model's user-defined protocols into plain data for the report
// (and anything else that wants a table of them): each protocol's messages with
// their parameters, plus which capsule ports use it. The built-in Timing/Log
// system protocols are left out — they're boilerplate, not part of a student's
// own design.
export function summarizeProtocols(metaModel) {
  const enums = metaModel.enumerations ?? [];
  const paramLabel = (p) => {
    const type = p.type === 'ENUM' ? (enums.find((e) => e.id === p.enumId)?.name ?? 'ENUM') : p.type;
    return `${p.name}: ${type}`;
  };

  return (metaModel.protocols ?? []).map((proto) => ({
    name: proto.name,
    messages: (proto.signals ?? []).map((sig) => ({
      name: sig.name,
      direction: sig.direction,
      params: (sig.params ?? []).map(paramLabel),
    })),
    usedBy: metaModel.classes.flatMap((cls) =>
      (cls.ports ?? [])
        .filter((port) => port.protocolId === proto.id)
        .map((port) => ({ capsule: cls.name, port: port.name, conjugated: !!port.conjugated }))
    ),
  }));
}
