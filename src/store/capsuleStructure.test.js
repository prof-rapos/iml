import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from './modelStore.js';

// Two capsule classes (C1 base port, C2 conjugate port, both typed by protocol
// 'p1') with one object each, plus a spare port/object on C1 and an unrelated
// protocol 'p2' for negative cases.
function seed() {
  useModelStore.setState({
    metaModel: {
      kind: 'metamodel', name: 'M',
      classes: [
        { id: 'C1', name: 'C1', attributes: [], ports: [
          { id: 'portA',  name: 'portA',  protocolId: 'p1', conjugated: false },
          { id: 'portA2', name: 'portA2', protocolId: 'p1', conjugated: false },
        ] },
        { id: 'C2', name: 'C2', attributes: [], ports: [
          { id: 'portB', name: 'portB', protocolId: 'p1', conjugated: true },
        ] },
        { id: 'C3', name: 'C3', attributes: [], ports: [
          { id: 'portC', name: 'portC', protocolId: 'p2', conjugated: true },
        ] },
      ],
      relations: [], enumerations: [], behaviours: {},
      protocols: [
        { id: 'p1', name: 'Proto1', signals: [] },
        { id: 'p2', name: 'Proto2', signals: [] },
      ],
    },
    instanceModels: [{
      id: 'IM', kind: 'instancemodel', name: 'IM',
      objects: [
        { id: 'o1', classId: 'C1', name: 'O1', attributeValues: {} },
        { id: 'o2', classId: 'C2', name: 'O2', attributeValues: {} },
        { id: 'o3', classId: 'C3', name: 'O3', attributeValues: {} },
        { id: 'o4', classId: 'C1', name: 'O4', attributeValues: {} },
      ],
      links: [], connectors: [],
    }],
    currentIMIndex: 0,
    layouts: {},
  });
}
const currentConnectors = () => useModelStore.getState().instanceModels[0].connectors;

describe('capsule structure connectors', () => {
  beforeEach(seed);

  it('addConnector joins a base port to a conjugate port of the same protocol', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    expect(id).toBeTruthy();
    expect(currentConnectors()).toEqual([{ id, sourceObjectId: 'o1', sourcePortId: 'portA', targetObjectId: 'o2', targetPortId: 'portB' }]);
  });

  it('rejects a connector joining an object to itself', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o1', 'portA2');
    expect(id).toBeNull();
    expect(currentConnectors()).toEqual([]);
  });

  it('rejects a connector between ports of different protocols', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o3', 'portC');
    expect(id).toBeNull();
    expect(currentConnectors()).toEqual([]);
  });

  it('rejects a connector between two base ports (not exactly one conjugated)', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o4', 'portA');
    expect(id).toBeNull();
    expect(currentConnectors()).toEqual([]);
  });

  it('rejects a connector reusing a port that is already connected', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    const id = useModelStore.getState().addConnector('o1', 'portA2', 'o2', 'portB');
    expect(id).toBeNull();
    expect(currentConnectors()).toHaveLength(1);
  });

  it('deleteConnector removes it', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().deleteConnector(id);
    expect(currentConnectors()).toEqual([]);
  });

  it('deleteObject cascades to connectors touching the deleted object', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().deleteObject('o1');
    expect(currentConnectors()).toEqual([]);
  });

  it('deleteClass cascades to connectors of objects removed with the class', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().deleteClass('C1');
    expect(currentConnectors()).toEqual([]);
  });

  it('deletePort cascades across instance models', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().deletePort('C1', 'portA');
    expect(currentConnectors()).toEqual([]);
  });

  it('updatePort re-validates an existing connector when conjugation flips', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().updatePort('C1', 'portA', { conjugated: true }); // now both ends conjugated
    expect(currentConnectors()).toEqual([]);
  });

  it('updatePort re-validates an existing connector when the protocol changes', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().updatePort('C1', 'portA', { protocolId: 'p2' });
    expect(currentConnectors()).toEqual([]);
  });

  it('updatePort leaves a still-valid connector alone when an unrelated field changes', () => {
    const id = useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().updatePort('C1', 'portA', { name: 'renamed' });
    expect(currentConnectors()).toEqual([{ id, sourceObjectId: 'o1', sourcePortId: 'portA', targetObjectId: 'o2', targetPortId: 'portB' }]);
  });

  it('deleteProtocol cascades to connectors left dangling by the port removal it already does', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().deleteProtocol('p1');
    expect(currentConnectors()).toEqual([]);
  });
});
