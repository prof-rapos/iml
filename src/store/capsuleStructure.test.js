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
        { id: 'C4', name: 'C4', attributes: [], ports: [
          { id: 'portD', name: 'log', protocolId: 'sys-log', conjugated: false },
        ] },
        { id: 'C5', name: 'C5', attributes: [], ports: [
          { id: 'portE', name: 'log', protocolId: 'sys-log', conjugated: true },
        ] },
        // Symmetric peer class (like TrafficLight): both a base and a
        // conjugate port of the same protocol, so two instances can be
        // wired reciprocally in both directions.
        { id: 'C6', name: 'C6', attributes: [], ports: [
          { id: 'portF', name: 'portF', protocolId: 'p1', conjugated: false },
          { id: 'portG', name: 'portG', protocolId: 'p1', conjugated: true },
        ] },
      ],
      relations: [
        { id: 'rel1', kind: 'REFERENCE', source: 'C1', target: 'C2', name: 'rel', sourceMultiplicity: '', targetMultiplicity: '' },
      ],
      enumerations: [], behaviours: {},
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
        { id: 'o5', classId: 'C4', name: 'O5', attributeValues: {} },
        { id: 'o6', classId: 'C5', name: 'O6', attributeValues: {} },
        { id: 'o7', classId: 'C6', name: 'O7', attributeValues: {} },
        { id: 'o8', classId: 'C6', name: 'O8', attributeValues: {} },
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

  it('rejects a connector between service (system-protocol) ports, even a valid base/conjugate pair', () => {
    const id = useModelStore.getState().addConnector('o5', 'portD', 'o6', 'portE');
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

  it('allows a reciprocal second connector between the same two objects, using the same class-defined port ids in reverse (regression: port ids are shared across instances of a class, so "already connected" must be scoped per object, not per bare port id)', () => {
    const first  = useModelStore.getState().addConnector('o7', 'portF', 'o8', 'portG');
    const second = useModelStore.getState().addConnector('o8', 'portF', 'o7', 'portG');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(currentConnectors()).toEqual([
      { id: first,  sourceObjectId: 'o7', sourcePortId: 'portF', targetObjectId: 'o8', targetPortId: 'portG' },
      { id: second, sourceObjectId: 'o8', sourcePortId: 'portF', targetObjectId: 'o7', targetPortId: 'portG' },
    ]);
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

  it('deleteClass cascades to connectors AND links of objects removed with the class', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    const linkId = useModelStore.getState().addLink('rel1', 'o1', 'o2');
    useModelStore.getState().deleteClass('C1');
    expect(currentConnectors()).toEqual([]);
    expect(useModelStore.getState().instanceModels[0].links.some((l) => l.id === linkId)).toBe(false);
  });

  it('clearInstanceModel clears connectors too, not just objects and links', () => {
    useModelStore.getState().addConnector('o1', 'portA', 'o2', 'portB');
    useModelStore.getState().clearInstanceModel();
    const im = useModelStore.getState().instanceModels[0];
    expect(im.objects).toEqual([]);
    expect(im.links).toEqual([]);
    expect(im.connectors).toEqual([]);
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
