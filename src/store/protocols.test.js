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

  it('a regular Log port yields no triggers (log is out); conjugation is a no-op for system ports', () => {
    // sys-timing/sys-log codegen never reads `conjugated` — it used to be
    // possible to "conjugate" one anyway and have capsuleMessages offer a
    // trigger that then silently never fired at runtime. updatePort now
    // forces conjugated back to false for any system-protocol port.
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'l', protocolId: 'sys-log' });
    expect(capsuleMessages('C', mm())).toEqual([]);
    useModelStore.getState().updatePort('C', pid, { conjugated: true });
    const port = mm().classes[0].ports.find((p) => p.id === pid);
    expect(port.conjugated).toBe(false);
    expect(capsuleMessages('C', mm())).toEqual([]);
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

  it('rejects renaming a port to duplicate a sibling port on the same class', () => {
    const a = useModelStore.getState().addPort('C');
    const b = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', a, { name: 'north' });
    useModelStore.getState().updatePort('C', b, { name: 'north' });
    const names = mm().classes[0].ports.map((p) => p.name);
    expect(names.filter((n) => n === 'north')).toHaveLength(1);
  });

  it('deleting an enum used by a protocol param reverts that param to STRING instead of leaving a dangling enumId', () => {
    const enumId = useModelStore.getState().addEnumeration();
    const prid = useModelStore.getState().addProtocol();
    const sid = useModelStore.getState().addSignal(prid, 'in');
    const paramId = useModelStore.getState().addParam(prid, sid);
    useModelStore.getState().updateParam(prid, sid, paramId, { type: 'ENUM', enumId });

    useModelStore.getState().deleteEnumeration(enumId);

    const param = mm().protocols.find((p) => p.id === prid).signals.find((s) => s.id === sid).params.find((p) => p.id === paramId);
    expect(param.type).toBe('STRING');
    expect(param.enumId).toBeUndefined();
  });

  it('the Timing protocol has a parameterless cancelTimer out-signal — the port identifies the timer', () => {
    const timing = allProtocols(mm()).find((p) => p.name === 'Timing');
    const cancel = timing.signals.find((s) => s.name === 'cancelTimer');
    expect(cancel.direction).toBe('out');
    expect(cancel.params).toEqual([]);
  });

  it('informIn/informEvery take only a millisecond duration; timeout takes no params', () => {
    const timing = allProtocols(mm()).find((p) => p.name === 'Timing');
    const informIn = timing.signals.find((s) => s.name === 'informIn');
    expect(informIn.params).toEqual([{ id: 'ms', name: 'ms', type: 'INT' }]);
    const timeout = timing.signals.find((s) => s.name === 'timeout');
    expect(timeout.params).toEqual([]);
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

  it('addSignal avoids name collisions after a delete + re-add cycle', () => {
    const prid = useModelStore.getState().addProtocol();
    const first = useModelStore.getState().addSignal(prid, 'in'); // signal1
    useModelStore.getState().addSignal(prid, 'in');                // signal2
    useModelStore.getState().deleteSignal(prid, first);            // only signal2 left
    useModelStore.getState().addSignal(prid, 'in');                // must not collide with signal2

    const names = mm().protocols.find((p) => p.id === prid).signals.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('addParam avoids name collisions after a delete + re-add cycle', () => {
    const prid = useModelStore.getState().addProtocol();
    const sid = useModelStore.getState().addSignal(prid, 'out');
    const first = useModelStore.getState().addParam(prid, sid); // param1
    useModelStore.getState().addParam(prid, sid);                // param2
    useModelStore.getState().deleteParam(prid, sid, first);      // only param2 left
    useModelStore.getState().addParam(prid, sid);                // must not collide with param2

    const names = mm().protocols.find((p) => p.id === prid).signals.find((s) => s.id === sid).params.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('capsuleMessages labels a triggerable signal with its params (none for timeout — the port is the identity)', () => {
    const pid = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', pid, { name: 'timer', protocolId: 'sys-timing' });
    const timeoutMsg = capsuleMessages('C', mm()).find((m) => m.value === 'timer.timeout');
    expect(timeoutMsg.label).toBe('timer.timeout');
  });

  it('two Timing ports on one capsule surface distinct, independently-identified timeout triggers', () => {
    const a = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', a, { name: 'timerA', protocolId: 'sys-timing' });
    const b = useModelStore.getState().addPort('C');
    useModelStore.getState().updatePort('C', b, { name: 'timerB', protocolId: 'sys-timing' });
    const triggers = capsuleMessages('C', mm()).map((m) => m.value);
    expect(triggers).toEqual(expect.arrayContaining(['timerA.timeout', 'timerB.timeout']));
  });

  it('capsuleCompletions inserts a single-param signal as a snippet with a tab-stop', () => {
    useModelStore.setState((s) => ({
      metaModel: { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
        c.id === 'C' ? { ...c, ports: [...c.ports, { id: 'tp', name: 'timer', protocolId: 'sys-timing', conjugated: false }] } : c) },
    }));
    const comps = capsuleCompletions('C', mm(), 'timer.');
    const informIn = comps.find((c) => c.label === 'informIn');
    expect(informIn.insert).toBe('informIn(${1:ms})');
    const cancel = comps.find((c) => c.label === 'cancelTimer');
    expect(cancel.insert).toBe('cancelTimer()');
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
