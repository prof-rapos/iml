import { describe, it, expect } from 'vitest';
import { buildSET } from './symbolicExecution.js';
import { generateAbstractTestCase, generateConcreteTestFiles, generateAllTestsFiles } from './mbtCodeGen.js';

const NO_ATTRS = { relations: [] };

const metaModel = {
  ...NO_ATTRS,
  classes: [{
    id: 'TL', name: 'TrafficLight',
    attributes: [{ id: 'aDir', name: 'direction', type: 'STRING', lowerBound: 1, upperBound: 1 }],
    ports: [
      { id: 'pIn', name: 'oppositeIn', protocolId: 'proto1', conjugated: false },
      { id: 'pTim', name: 'timer', protocolId: 'sys-timing', conjugated: false },
    ],
  }],
  protocols: [
    { id: 'proto1', name: 'opposite', signals: [{ id: 'sig1', name: 'safe', direction: 'in', params: [] }] },
  ],
  behaviours: {
    TL: {
      states: [
        { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
        { id: 'sRed', kind: 'simple', name: 'Red', entry: 'direction = "NS";', exit: '' },
        { id: 'sGreen', kind: 'simple', name: 'Green', entry: 'timer.informIn(7000);', exit: '' },
      ],
      transitions: [
        { id: 'tInit', source: 'sInit', target: 'sRed', trigger: '', guard: '', effect: '' },
        { id: 't1', source: 'sRed', target: 'sGreen', trigger: 'oppositeIn.safe', guard: '', effect: '' },
      ],
    },
  },
};

describe('generateAbstractTestCase', () => {
  const result = buildSET('TL', metaModel);
  const greenNode = [...result.nodesById.values()].find((n) => n.stateId === 'sGreen');

  it('returns the root-to-leaf event sequence in order', () => {
    const tc = generateAbstractTestCase(greenNode.id, result, metaModel);
    expect(tc.steps).toHaveLength(1);
    expect(tc.steps[0].kind).toBe('signal');
    expect(tc.steps[0].label).toContain('oppositeIn.safe');
  });

  it('produces an assertion outcome naming the expected state and known attributes', () => {
    const tc = generateAbstractTestCase(greenNode.id, result, metaModel);
    expect(tc.outcome.kind).toBe('assert');
    expect(tc.outcome.label).toContain('Green');
    expect(tc.outcome.label).toContain('direction=NS');
  });

  it('flags no guard fork for an unconditional-only path', () => {
    const tc = generateAbstractTestCase(greenNode.id, result, metaModel);
    expect(tc.guardForkPresent).toBe(false);
  });

  it('returns null for an unknown leaf id', () => {
    expect(generateAbstractTestCase('nope', result, metaModel)).toBeNull();
  });

  it('describes a subsumed leaf without a fixed-endpoint assertion', () => {
    // Extend the fixture with a cycle back to Red so a subsumed leaf exists.
    const cyclic = {
      ...metaModel,
      behaviours: {
        TL: {
          states: metaModel.behaviours.TL.states,
          transitions: [
            ...metaModel.behaviours.TL.transitions,
            { id: 't2', source: 'sGreen', target: 'sRed', trigger: 'timer.timeout', guard: '', effect: '' },
          ],
        },
      },
    };
    const cyclicResult = buildSET('TL', cyclic);
    const subsumed = [...cyclicResult.nodesById.values()].find((n) => n.status === 'leaf-subsumed');
    const tc = generateAbstractTestCase(subsumed.id, cyclicResult, cyclic);
    expect(tc.outcome.kind).toBe('subsumed');
    expect(tc.outcome.label).toContain('Red');
  });
});

function fileFor(files, name) {
  return files.find((f) => f.path.endsWith(`/${name}`))?.content ?? '';
}

const cls = metaModel.classes[0];

describe('generateConcreteTestFiles', () => {
  const result = buildSET('TL', metaModel);
  const greenNode = [...result.nodesById.values()].find((n) => n.stateId === 'sGreen');

  it('returns null for a depth-bound leaf', () => {
    const depthBoundResult = { ...result, nodesById: new Map(result.nodesById) };
    depthBoundResult.nodesById.set(greenNode.id, { ...greenNode, status: 'leaf-depth-bound' });
    expect(generateConcreteTestFiles(greenNode.id, depthBoundResult, cls, metaModel)).toBeNull();
  });

  it('returns null for an unknown leaf id', () => {
    expect(generateConcreteTestFiles('nope', result, cls, metaModel)).toBeNull();
  });

  it('bundles Module 3\'s own generated files plus TestScheduler and MBTAssert', () => {
    const { files } = generateConcreteTestFiles(greenNode.id, result, cls, metaModel);
    expect(fileFor(files, 'TrafficLight.java')).toContain('class TrafficLight');
    expect(fileFor(files, 'TestScheduler.java')).toContain('extends Scheduler');
    expect(fileFor(files, 'MBTAssert.java')).toContain('class MBTAssert');
  });

  it('wires a no-op stub for every user-protocol port and drives the script in order', () => {
    const { files, mainClassPath } = generateConcreteTestFiles(greenNode.id, result, cls, metaModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('capsule.connectOppositeIn(new OppositeReceiver() {});');
    expect(test).toContain('capsule.start();');
    expect(test).toContain('capsule.getOppositeInReceiver().safe();');
    expect(test).toContain('MBTAssert.assertEquals("state", "GREEN", capsule.getCurrentStateName());');
  });
});

describe('generateAllTestsFiles', () => {
  it('generates one runnable file looping over every non-open, non-depth-bound leaf', () => {
    const result = buildSET('TL', metaModel);
    const { files, mainClassPath } = generateAllTestsFiles(result, cls, metaModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('class TrafficLightAllTests');
    expect(test).toContain('total++');
    expect(test).toContain('tests, ');
  });
});
