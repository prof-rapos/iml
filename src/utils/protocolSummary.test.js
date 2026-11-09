import { describe, it, expect } from 'vitest';
import { summarizeProtocols } from './protocolSummary.js';

const metaModel = {
  classes: [
    { id: 'm', name: 'Machine', ports: [{ id: 'p1', name: 'customer', protocolId: 'vend', conjugated: false }, { id: 'p2', name: 'log', protocolId: 'sys-log', conjugated: false }] },
    { id: 'c', name: 'Customer', ports: [{ id: 'p3', name: 'machine', protocolId: 'vend', conjugated: true }] },
  ],
  enumerations: [{ id: 'e1', name: 'Item', literals: ['SODA'] }],
  protocols: [
    { id: 'vend', name: 'Vending', signals: [
      { id: 's1', name: 'insertCoin', direction: 'in', params: [{ id: 'a', name: 'cents', type: 'INT' }] },
      { id: 's2', name: 'selectItem', direction: 'in', params: [{ id: 'b', name: 'item', type: 'ENUM', enumId: 'e1' }] },
      { id: 's3', name: 'cancel', direction: 'in', params: [] },
    ] },
    { id: 'empty', name: 'Unused', signals: [] },
  ],
};

describe('summarizeProtocols', () => {
  it('lists each user protocol with its messages, directions and typed parameters', () => {
    const [vend] = summarizeProtocols(metaModel);
    expect(vend.name).toBe('Vending');
    expect(vend.messages).toEqual([
      { name: 'insertCoin', direction: 'in', params: ['cents: INT'] },
      { name: 'selectItem', direction: 'in', params: ['item: Item'] },   // enum resolved to its name
      { name: 'cancel', direction: 'in', params: [] },
    ]);
  });

  it('reports which ports use each protocol, with their role', () => {
    const [vend, unused] = summarizeProtocols(metaModel);
    expect(vend.usedBy).toEqual([
      { capsule: 'Machine', port: 'customer', conjugated: false },
      { capsule: 'Customer', port: 'machine', conjugated: true },
    ]);
    expect(unused.usedBy).toEqual([]);
  });

  it('leaves out the built-in system protocols and copes with a model that has none', () => {
    expect(summarizeProtocols(metaModel).map((p) => p.name)).toEqual(['Vending', 'Unused']);
    expect(summarizeProtocols({ classes: [] })).toEqual([]);
  });
});
