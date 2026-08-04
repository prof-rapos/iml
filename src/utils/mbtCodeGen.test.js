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

  it('generates a runnable test for a depth-bound leaf that drives the path AND asserts the state reached so far', () => {
    const depthBoundResult = { ...result, nodesById: new Map(result.nodesById) };
    depthBoundResult.nodesById.set(greenNode.id, { ...greenNode, status: 'leaf-depth-bound' });
    const { files, mainClassPath } = generateConcreteTestFiles(greenNode.id, depthBoundResult, cls, metaModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('capsule.getOppositeInReceiver().safe();'); // path still driven
    expect(test).toContain('MBTAssert.assertEquals("state", "GREEN", capsule.getCurrentStateName());'); // the leaf itself is a real, known point — assert it
    expect(test).toContain('depth limit reached');
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

  it('produces a valid Java identifier for the test class name even when the leaf id contains "-"', () => {
    // nanoid ids can contain "-", which isn't a valid Java identifier
    // character — regression for a real bug found via a hand-generated
    // model whose leaf id happened to contain one.
    const hyphenatedResult = { ...result, nodesById: new Map(result.nodesById) };
    const hyphenatedNode = { ...greenNode, id: 'ab-cdef' };
    hyphenatedResult.nodesById.set('ab-cdef', hyphenatedNode);
    const { mainClassPath } = generateConcreteTestFiles('ab-cdef', hyphenatedResult, cls, metaModel);
    const className = mainClassPath.split('/').pop().replace('.java', '');
    expect(className).toMatch(/^[A-Za-z_$][\w$]*$/);
    expect(className).not.toContain('-');
  });
});

describe('generateConcreteTestFiles — DOUBLE attribute assertions', () => {
  // Regression: a whole-number DOUBLE value (e.g. a default of "20") was
  // previously emitted as a bare literal `20`, an int autoboxed to
  // Integer("20") — MBTAssert's string comparison against the real getter's
  // Double("20.0") then spuriously failed even though the value was
  // correct. A `(double)` cast forces Java to see a double regardless of
  // whether the tracked value string has a decimal point.
  const doubleModel = {
    ...NO_ATTRS,
    classes: [{
      id: 'TH', name: 'Thermostat',
      attributes: [{ id: 'aTemp', name: 'temperature', type: 'DOUBLE', lowerBound: 1, upperBound: 1, defaultValue: '20' }],
      // Needs at least one port — a state machine on a class with none
      // doesn't get a generated capsule body at all (isCapsuleClass gates
      // purely on ports.length, a separate real bug found in this same
      // review), which would make this fixture's generated bundle not
      // actually compile.
      ports: [{ id: 'pLog', name: 'log', protocolId: 'sys-log', conjugated: false }],
    }],
    behaviours: {
      TH: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sIdle', kind: 'simple', name: 'Idle', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sIdle', trigger: '', guard: '', effect: '' },
        ],
      },
    },
  };
  const doubleCls = doubleModel.classes[0];

  it('casts a whole-number DOUBLE literal to (double) instead of emitting a bare int literal', () => {
    const result = buildSET('TH', doubleModel);
    const idleNode = [...result.nodesById.values()].find((n) => n.stateId === 'sIdle');
    const { files, mainClassPath } = generateConcreteTestFiles(idleNode.id, result, doubleCls, doubleModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('MBTAssert.assertEquals("temperature", (double) 20, capsule.getTemperature());');
    expect(test).not.toMatch(/"temperature", 20,/); // the old, spuriously-failing bare-int form
  });
});

describe('generateAllTestsFiles', () => {
  it('generates one runnable file with a main() that dispatches to per-test methods', () => {
    const result = buildSET('TL', metaModel);
    const { files, mainClassPath } = generateAllTestsFiles(result, cls, metaModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('class TrafficLightAllTests');
    expect(test).toContain('total++');
    expect(test).toContain('tests, ');
  });

  it('puts each test case\'s body in its own private method, not inlined in main() (bytecode-size scaling)', () => {
    const result = buildSET('TL', metaModel);
    const { files, mainClassPath } = generateAllTestsFiles(result, cls, metaModel);
    const test = fileFor(files, mainClassPath.split('/').pop());

    expect(test).toContain('private static boolean test1()');

    // main()'s own body is just the reflection dispatch loop — none of a
    // test's own construct/wire/run lines should appear before the first
    // method definition starts.
    const mainStart = test.indexOf('public static void main');
    const firstMethodStart = test.indexOf('private static boolean test1()');
    const mainBody = test.slice(mainStart, firstMethodStart);
    expect(mainBody).not.toContain('capsule.start()');
    expect(mainBody).not.toContain('MBTAssert.assertEquals');
  });

  it('scales to many leaves without inflating any single method (synthetic large-suite check)', () => {
    // A guard-fork chain gives one leaf per guard branch — enough distinct
    // leaves from a small model to meaningfully exercise "many test
    // methods" without needing a huge fixture.
    const manyLeavesModel = {
      ...NO_ATTRS,
      classes: [cls],
      protocols: metaModel.protocols,
      behaviours: {
        TL: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
            ...Array.from({ length: 20 }, (_, i) => ({ id: `sB${i}`, kind: 'simple', name: `B${i}`, entry: '', exit: '' })),
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: '' },
            ...Array.from({ length: 20 }, (_, i) => ({
              id: `t${i}`, source: 'sA', target: `sB${i}`, trigger: 'oppositeIn.safe', guard: `x == ${i}`, effect: '',
            })),
          ],
        },
      },
    };
    const result = buildSET('TL', manyLeavesModel);
    const { files, mainClassPath } = generateAllTestsFiles(result, cls, manyLeavesModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    const methodCount = (test.match(/private static boolean test\d+\(\)/g) || []).length;
    expect(methodCount).toBeGreaterThanOrEqual(20);
    // Every method body should be roughly the same, bounded size — no single
    // method accumulates other tests' content.
    const firstMethod = test.slice(test.indexOf('private static boolean test1()'), test.indexOf('private static boolean test2()'));
    expect(firstMethod.length).toBeLessThan(800);

    // main()'s own body (the reflection dispatch loop) stays constant-size
    // regardless of leaf count — the whole point of looking test methods up
    // by name in a loop instead of listing one call site per test.
    const mainStart = test.indexOf('public static void main');
    const firstMethodStart = test.indexOf('private static boolean test1()');
    const mainBody = test.slice(mainStart, firstMethodStart);
    expect(mainBody).toContain('getDeclaredMethod("test" + i)');
    expect(mainBody.length).toBeLessThan(700);
  });

  it('includes depth-bound leaves too, driving the path and asserting the state/attributes reached so far', () => {
    const loopModel = {
      ...NO_ATTRS,
      classes: [{ id: 'C', name: 'C', attributes: [{ id: 'aX', name: 'x', type: 'INT', lowerBound: 1, upperBound: 1 }] }],
      protocols: [{ id: 'proto1', name: 'p', signals: [{ id: 'sig1', name: 'tick', direction: 'in', params: [] }] }],
      behaviours: {
        C: {
          states: [
            { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
            { id: 'sA', kind: 'simple', name: 'A', entry: '', exit: '' },
          ],
          transitions: [
            { id: 'tInit', source: 'sInit', target: 'sA', trigger: '', guard: '', effect: 'x = 0;' },
            { id: 'tLoop', source: 'sA', target: 'sA', trigger: 'p.tick', guard: '', effect: 'x = x + 1;' },
          ],
        },
      },
    };
    const loopCls = { id: 'C', name: 'C', attributes: loopModel.classes[0].attributes, ports: [{ id: 'pP', name: 'p', protocolId: 'proto1', conjugated: false }] };
    loopModel.classes = [loopCls];
    const result = buildSET('C', loopModel);
    expect([...result.nodesById.values()].some((n) => n.status === 'leaf-depth-bound')).toBe(true);

    const { files, mainClassPath } = generateAllTestsFiles(result, loopCls, loopModel);
    const test = fileFor(files, mainClassPath.split('/').pop());
    expect(test).toContain('depth limit reached');
    // The depth-bound leaf's own method should assert the state/attribute
    // values actually reached (e.g. x=40 after 40 loop iterations) — a real,
    // useful assertion, not a vacuous "return true" with nothing checked.
    expect(test).toMatch(/MBTAssert\.assertEquals\("x", \d+, capsule\.getX\(\)\)/);
  });
});
