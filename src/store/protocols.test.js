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

  it('the Timing protocol has a cancelTimer out-signal taking a tag', () => {
    const timing = allProtocols(mm()).find((p) => p.name === 'Timing');
    const cancel = timing.signals.find((s) => s.name === 'cancelTimer');
    expect(cancel.direction).toBe('out');
    expect(cancel.params).toEqual([{ id: 'tag', name: 'tag', type: 'STRING' }]);
  });

  it('informIn takes a tag and a millisecond duration; timeout carries the tag back', () => {
    const timing = allProtocols(mm()).find((p) => p.name === 'Timing');
    const informIn = timing.signals.find((s) => s.name === 'informIn');
    expect(informIn.params.map((p) => p.name)).toEqual(['tag', 'ms']);
    const timeout = timing.signals.find((s) => s.name === 'timeout');
    expect(timeout.params).toEqual([{ id: 'tag', name: 'tag', type: 'STRING' }]);
  });
});

describe('signal parameters', () => {
  beforeEach(seed);

  it('addParam appends a default STRING param; updateParam and deleteParam mutate/remove it', () => {
    const prid = useModelStore.getState().addProtocol();
    const sid = useModelStore.getState().addSignal(prid, 'out');
    const paramId = useModelStore.getState().addParam(prid, sid);

    let sig = mm().protocols.find((p) => p.id === prid).signals.find((s) => s.id === sid);
    expect(sig.params).toEqual([{ id: paramId, name: 'param1', type: 'STRING' }]);

    useModelStore.getState().updateParam(prid, sid, paramId, { name: 'amount', type: 'INT' });
    sig = mm().protocols.find((p) => p.id === prid).signals.find((s) => s.id === sid);
    expect(sig.params).toEqual([{ id: paramId, name: 'amount', type: 'INT' }]);

    useModelStore.getState().deleteParam(prid, sid, paramId);
    sig = mm().protocols.find((p) => p.id === prid).signals.find((s) => s.id === sid);
    expect(sig.params).toEqual([]);
  });

  it('capsuleMessages labels a triggerable signal with its params', () => {
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'timer', protocolId: 'sys-timing' });
    const timeoutMsg = capsuleMessages('C', mm()).find((m) => m.value === 'timer.timeout');
    expect(timeoutMsg.label).toBe('timer.timeout(tag)');
  });

  it('capsuleCompletions inserts a multi-param signal as a snippet with sequential tab-stops', () => {
    useModelStore.setState((s) => ({
      metaModel: { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
        c.id === 'C' ? { ...c, ports: [...c.ports, { id: 'tp', name: 'timer', protocolId: 'sys-timing', conjugated: false }] } : c) },
    }));
    const comps = capsuleCompletions('C', mm(), 'timer.');
    const informIn = comps.find((c) => c.label === 'informIn');
    expect(informIn.insert).toBe('informIn(${1:tag}, ${2:ms})');
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

  it('offers a port\'s signals as method sends after a dot, with param placeholders as snippet tab-stops', () => {
    const comps = capsuleCompletions('C', mm(), 'log.');
    expect(comps.map((c) => c.label)).toContain('log');
    const logComp = comps.find((c) => c.label === 'log');
    expect(logComp.insert).toBe('log(${1:message})');
    expect(logComp.kind).toBe('method');
    expect(logComp.detail).toBe('Log · send(message: STRING)');
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
