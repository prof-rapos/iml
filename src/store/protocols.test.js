import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore, capsuleMessages, capsuleCompletions, allProtocols, SYSTEM_PROTOCOLS } from './modelStore.js';

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

describe('capsuleCompletions', () => {
  beforeEach(() => {
    useModelStore.setState({
      metaModel: {
        kind: 'metamodel', name: 'M',
        classes: [{ id: 'C', name: 'C',
          attributes: [{ id: 'a', name: 'balance', type: 'INT', lowerBound: 0, upperBound: 1 }],
          ports: [{ id: 'p', name: 'log', protocolId: 'sys-log', conjugated: false }] }],
        relations: [], enumerations: [], behaviours: {}, protocols: [],
      },
      layouts: {},
    });
  });

  it('offers ports and capsule attributes at the start of an expression', () => {
    const labels = capsuleCompletions('C', mm(), 'x = ').map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['log', 'balance']));
  });

  it('offers a port\'s signals as method sends after a dot', () => {
    const comps = capsuleCompletions('C', mm(), 'log.');
    expect(comps.map((c) => c.label)).toContain('log');
    expect(comps.find((c) => c.label === 'log').insert).toBe('log()');
    expect(comps.find((c) => c.label === 'log').kind).toBe('method');
  });

  it('returns nothing after a dot on an unknown port', () => {
    expect(capsuleCompletions('C', mm(), 'nope.')).toEqual([]);
  });

  it('only offers sendable (out) signals after a dot — a Timing port sends informIn/informEvery, not timeout', () => {
    // Add a regular Timing port.
    useModelStore.setState((s) => ({
      metaModel: { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
        c.id === 'C' ? { ...c, ports: [...c.ports, { id: 'tp', name: 'timer', protocolId: 'sys-timing', conjugated: false }] } : c) },
    }));
    const sends = capsuleCompletions('C', mm(), 'timer.').map((c) => c.label);
    expect(sends).toEqual(expect.arrayContaining(['informIn', 'informEvery']));
    expect(sends).not.toContain('timeout'); // timeout is received (in), not sent
  });

  it('timeout is still a receivable trigger message on a Timing port', () => {
    useModelStore.setState((s) => ({
      metaModel: { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
        c.id === 'C' ? { ...c, ports: [...c.ports, { id: 'tp', name: 'timer', protocolId: 'sys-timing', conjugated: false }] } : c) },
    }));
    const triggers = capsuleMessages('C', mm()).map((m) => m.value);
    expect(triggers).toContain('timer.timeout');
    expect(triggers).not.toContain('timer.informIn'); // informIn is sent, not received
  });
});
