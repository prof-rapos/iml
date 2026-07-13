import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore, capsuleMessages, allProtocols, SYSTEM_PROTOCOLS } from './modelStore.js';

function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'M',
      classes: [{ id: 'C', name: 'C', attributes: [], ports: [] }],
      relations: [], enumerations: [], behaviours: {}, protocols: [],
    },
    layouts: {},
  });
}
const mm = () => useModelStore.getState().metaModel;

describe('protocols & ports', () => {
  beforeEach(seed);

  it('exposes the built-in system protocols', () => {
    expect(allProtocols(mm()).map((p) => p.name)).toEqual(expect.arrayContaining(['Timing', 'Log']));
  });

  it('adds a port defaulting to the first system protocol', () => {
    const id = useModelStore.getState().addPort('C');
    const port = mm().classes[0].ports.find((p) => p.id === id);
    expect(port.protocolId).toBe(SYSTEM_PROTOCOLS[0].id);
    expect(port.conjugated).toBe(false);
  });

  it('capsuleMessages returns the in-signals of a regular Timing port', () => {
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'timer', protocolId: 'sys-timing' });
    expect(capsuleMessages('C', mm()).map((m) => m.value)).toContain('timer.timeout');
  });

  it('a regular Log port yields no triggers (log is out); conjugation flips it', () => {
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'l', protocolId: 'sys-log' });
    expect(capsuleMessages('C', mm())).toEqual([]);
    useModelStore.getState().updatePort('C', pid, { conjugated: true });
    expect(capsuleMessages('C', mm()).map((m) => m.value)).toContain('l.log');
  });

  it('surfaces user-defined protocol signals as messages', () => {
    const prid = useModelStore.getState().addProtocol();
    const sid = useModelStore.getState().addSignal(prid, 'in');
    useModelStore.getState().updateSignal(prid, sid, { name: 'coin' });
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'money', protocolId: prid });
    expect(capsuleMessages('C', mm()).map((m) => m.value)).toContain('money.coin');
  });

  it('deleting a protocol removes ports that referenced it', () => {
    const prid = useModelStore.getState().addProtocol();
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { protocolId: prid });
    useModelStore.getState().deleteProtocol(prid);
    expect(mm().classes[0].ports.some((p) => p.id === pid)).toBe(false);
  });
});
