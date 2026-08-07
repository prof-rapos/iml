import { describe, it, expect } from 'vitest';
import { generateJavaCode } from './javaCodeGen.js';

// Animal (abstract) <- Dog, plus a multi-valued attribute and a reference relation.
const metaModel = {
  kind: 'metamodel',
  name: 'Pets',
  classes: [
    {
      id: 'Animal', name: 'Animal', isAbstract: true,
      attributes: [
        { id: 'a1', name: 'name', type: 'STRING',  visibility: 'PUBLIC', lowerBound: 1, upperBound: 1 },
        { id: 'a2', name: 'age',  type: 'INT',      visibility: 'PUBLIC', lowerBound: 0, upperBound: 1, defaultValue: '0' },
      ],
    },
    {
      id: 'Dog', name: 'Dog', isAbstract: false,
      attributes: [
        { id: 'a3', name: 'tricks', type: 'STRING', visibility: 'PUBLIC', lowerBound: 0, upperBound: -1 },
      ],
    },
  ],
  relations: [
    { id: 'r1', kind: 'INHERITANCE', source: 'Dog', target: 'Animal', name: '' },
  ],
};

function fileFor(files, name) {
  return files.find((f) => f.path.endsWith(`/${name}`))?.content ?? '';
}

describe('generateJavaCode', () => {
  const files = generateJavaCode(metaModel, []);

  it('emits one .java file per class', () => {
    expect(fileFor(files, 'Animal.java')).not.toBe('');
    expect(fileFor(files, 'Dog.java')).not.toBe('');
  });

  it('derives the package name from the meta-model name', () => {
    expect(fileFor(files, 'Animal.java')).toContain('package iml.pets;');
  });

  it('marks an abstract class as abstract', () => {
    expect(fileFor(files, 'Animal.java')).toContain('public abstract class Animal');
  });

  it('renders inheritance with extends and a super() call', () => {
    const dog = fileFor(files, 'Dog.java');
    expect(dog).toContain('public class Dog extends Animal');
    expect(dog).toContain('super(');
  });

  it('maps IML primitive types to Java types', () => {
    const animal = fileFor(files, 'Animal.java');
    expect(animal).toContain('private String name');
    expect(animal).toContain('private int age');
  });

  it('applies a meta-model default value to the field initializer', () => {
    expect(fileFor(files, 'Animal.java')).toContain('private int age = 0;');
  });

  it('renders a multi-valued attribute as an ArrayList with the boxed type', () => {
    const dog = fileFor(files, 'Dog.java');
    expect(dog).toContain('import java.util.ArrayList;');
    expect(dog).toContain('ArrayList<String> tricks');
    expect(dog).toContain('public void addTricks(String value)');
  });

  it('generates getters and setters for own attributes', () => {
    const animal = fileFor(files, 'Animal.java');
    expect(animal).toContain('public String getName()');
    expect(animal).toContain('public void setName(String name)');
  });
});

describe('generateJavaCode — enumerations', () => {
  const metaWithEnum = {
    kind: 'metamodel',
    name: 'Pets',
    enumerations: [
      { id: 'e1', name: 'Size', literals: ['SMALL', 'MEDIUM', 'LARGE'] },
    ],
    classes: [
      {
        id: 'Dog', name: 'Dog', isAbstract: false,
        attributes: [
          { id: 'a1', name: 'size', type: 'ENUM', enumId: 'e1', visibility: 'PUBLIC', lowerBound: 1, upperBound: 1 },
        ],
      },
    ],
    relations: [],
  };

  const im = {
    id: 'im1', kind: 'instancemodel', name: 'Pack',
    objects: [{ id: 'o1', classId: 'Dog', name: 'Rex', attributeValues: { a1: 'LARGE' } }],
    links: [],
  };

  const files = generateJavaCode(metaWithEnum, [im]);

  it('emits a Java enum file with the literals', () => {
    const size = fileFor(files, 'Size.java');
    expect(size).toContain('public enum Size {');
    expect(size).toContain('SMALL, MEDIUM, LARGE');
  });

  it('types an enum-valued field with the enum class name', () => {
    const dog = fileFor(files, 'Dog.java');
    expect(dog).toContain('private Size size');
    expect(dog).toContain('public Size getSize()');
    expect(dog).toContain('public void setSize(Size size)');
  });

  it('references an enum literal as EnumName.LITERAL in the instance file', () => {
    const pack = fileFor(files, 'Pack.java');
    expect(pack).toContain('.setSize(Size.LARGE);');
  });
});

describe('generateJavaCode — inherited multi-valued attribute triggers the ArrayList import', () => {
  // Dog has no own multi-valued attribute or relation, only an inherited one —
  // needsArrayList must look at allAttrs, not just the class's own attributes.
  const meta = {
    kind: 'metamodel', name: 'Pets',
    classes: [
      { id: 'Animal', name: 'Animal', isAbstract: true,
        attributes: [{ id: 'a1', name: 'tags', type: 'STRING', visibility: 'PUBLIC', lowerBound: 0, upperBound: -1 }] },
      { id: 'Dog', name: 'Dog', isAbstract: false, attributes: [] },
    ],
    relations: [{ id: 'r1', kind: 'INHERITANCE', source: 'Dog', target: 'Animal', name: '' }],
  };
  const files = generateJavaCode(meta, []);

  it('imports ArrayList in the subclass file even though the multi-valued attribute is inherited', () => {
    expect(fileFor(files, 'Dog.java')).toContain('import java.util.ArrayList;');
  });
});

describe('generateJavaCode — enum literals that sanitize to the same identifier stay unique', () => {
  const meta = {
    kind: 'metamodel', name: 'Pets',
    enumerations: [{ id: 'e1', name: 'Weird', literals: ['A!', 'A?'] }],
    classes: [],
    relations: [],
  };
  const files = generateJavaCode(meta, []);

  it('suffixes the second colliding constant instead of emitting a duplicate', () => {
    const en = fileFor(files, 'Weird.java');
    expect(en).toContain('A_, A__1');
  });
});

describe('generateJavaCode — bare numeric multiplicities greater than 1 are treated as multi-valued', () => {
  const meta = {
    kind: 'metamodel', name: 'Pets',
    classes: [
      { id: 'A', name: 'A', isAbstract: false, attributes: [] },
      { id: 'B', name: 'B', isAbstract: false, attributes: [] },
    ],
    relations: [
      { id: 'r1', kind: 'REFERENCE', source: 'A', target: 'B', name: 'bs', targetMultiplicity: '3' },
    ],
  };
  const files = generateJavaCode(meta, []);

  it('renders the relation field as an ArrayList instead of a single scalar', () => {
    const a = fileFor(files, 'A.java');
    expect(a).toContain('ArrayList<B> bs');
  });
});

// Trimmed version of the TrafficLight example model (public/examples/
// Lights.iml.json): a capsule class with two user-protocol ports (base +
// conjugate on the same bidirectional "opposite" protocol), a Timing port,
// a Log port, and a 3-state cyclic state machine (Red -> Green -> Yellow -> Red).
describe('generateJavaCode — behavioural codegen (capsules, ports, state machines)', () => {
  const metaModel = {
    kind: 'metamodel', name: 'Lights',
    classes: [
      {
        id: 'TL', name: 'TrafficLight', isAbstract: false,
        attributes: [
          { id: 'a1', name: 'direction', type: 'STRING', visibility: 'PUBLIC', lowerBound: 1, upperBound: 1 },
        ],
        ports: [
          { id: 'pIn',  name: 'oppositeIn',  protocolId: 'proto1',      conjugated: false },
          { id: 'pOut', name: 'oppositeOut', protocolId: 'proto1',      conjugated: true },
          { id: 'pTim', name: 'timer',       protocolId: 'sys-timing',  conjugated: false },
          { id: 'pLog', name: 'log',         protocolId: 'sys-log',     conjugated: false },
        ],
      },
    ],
    relations: [],
    enumerations: [],
    protocols: [
      { id: 'proto1', name: 'opposite', signals: [{ id: 'sig1', name: 'safe', direction: 'in', params: [] }] },
    ],
    behaviours: {
      TL: {
        states: [
          { id: 'sRed',    kind: 'simple',  name: 'Red',    entry: 'oppositeOut.safe();', exit: '' },
          { id: 'sGreen',  kind: 'simple',  name: 'Green',  entry: 'timer.informIn(10000);', exit: '' },
          { id: 'sYellow', kind: 'simple',  name: 'Yellow', entry: 'timer.informIn(2000);', exit: '' },
          { id: 'sInit',   kind: 'initial', name: '',       entry: '', exit: '' },
        ],
        transitions: [
          { id: 't1', source: 'sRed',    target: 'sGreen',  trigger: 'oppositeIn.safe', guard: '', effect: '' },
          { id: 't2', source: 'sGreen',  target: 'sYellow', trigger: 'timer.timeout',   guard: '', effect: '' },
          { id: 't3', source: 'sYellow', target: 'sRed',    trigger: 'timer.timeout',   guard: '', effect: '' },
          { id: 't4', source: 'sInit',   target: 'sRed',    trigger: '',                guard: '', effect: '' },
        ],
      },
    },
  };

  const im = {
    id: 'im1', kind: 'instancemodel', name: 'Intersection',
    objects: [
      { id: 'ns', classId: 'TL', name: 'NorthSouth', attributeValues: { a1: 'NS' } },
      { id: 'ew', classId: 'TL', name: 'EastWest',   attributeValues: { a1: 'EW' } },
    ],
    links: [],
    connectors: [
      { id: 'c1', sourceObjectId: 'ns', sourcePortId: 'pOut', targetObjectId: 'ew', targetPortId: 'pIn' },
      { id: 'c2', sourceObjectId: 'ns', sourcePortId: 'pIn',  targetObjectId: 'ew', targetPortId: 'pOut' },
    ],
  };

  describe('structural scope (default) ignores ports/behaviour entirely', () => {
    const files = generateJavaCode(metaModel, [im]);

    it('emits only the plain structural class, no capsule/runtime files', () => {
      expect(files.map(f => f.path)).not.toContain('iml/lights/Scheduler.java');
      expect(files.map(f => f.path)).not.toContain('iml/lights/OppositeReceiver.java');
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).not.toContain('dispatch(');
      expect(tl).not.toContain('enum Trigger');
      expect(tl).not.toContain('TimingPort');
    });
  });

  describe('behavioural scope', () => {
    const files = generateJavaCode(metaModel, [im], 'behavioural');

    it('emits the runtime helper files and a protocol receiver interface', () => {
      expect(fileFor(files, 'Scheduler.java')).toContain('class Scheduler');
      expect(fileFor(files, 'TimingPort.java')).toContain('class TimingPort');
      expect(fileFor(files, 'LogPort.java')).toContain('class LogPort');
      expect(fileFor(files, 'OppositeReceiver.java')).toContain('default void safe()');
    });

    it('generates a Trigger enum from the receivable port.signal messages', () => {
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).toContain('enum Trigger');
      expect(tl).toContain('OPPOSITEIN_SAFE');
      expect(tl).toContain('TIMER_TIMEOUT');
    });

    it('generates a State enum and enter/exit methods pasting the action code verbatim', () => {
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).toContain('enum State');
      expect(tl).toContain('private void enterRed()');
      expect(tl).toContain('oppositeOut.safe();');
      expect(tl).toContain('timer.informIn(10000);');
    });

    it('exposes the current state name via a public String getter (for Module 5 test assertions, no reflection needed)', () => {
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).toContain('public String getCurrentStateName() { return currentState == null ? null : currentState.name(); }');
    });

    it('dispatch() switches on currentState and guards the trigger, dropping unmatched signals', () => {
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).toContain('private void dispatch(Trigger trigger)');
      expect(tl).toContain('if (currentState == null) return;');
      expect(tl).toContain('case RED:');
      expect(tl).toContain('if (trigger == Trigger.OPPOSITEIN_SAFE)');
    });

    it('gives a Timing-port capsule a Scheduler-taking constructor without a final-field violation', () => {
      const tl = fileFor(files, 'TrafficLight.java');
      expect(tl).toContain('public TrafficLight(Scheduler scheduler)');
      expect(tl).not.toContain('private final Scheduler scheduler');
      expect(tl).not.toContain('private final TimingPort');
    });

    it('wires both directions of each connector so a send-only port on one side is never left null', () => {
      const main = fileFor(files, 'Intersection.java');
      // c1: ns.oppositeOut <-> ew.oppositeIn
      expect(main).toContain('northSouth.connectOppositeOut(eastWest.getOppositeInReceiver());');
      expect(main).toContain('eastWest.connectOppositeIn(northSouth.getOppositeOutReceiver());');
      // c2: ns.oppositeIn <-> ew.oppositeOut — this is what makes eastWest.oppositeOut non-null
      expect(main).toContain('northSouth.connectOppositeIn(eastWest.getOppositeOutReceiver());');
      expect(main).toContain('eastWest.connectOppositeOut(northSouth.getOppositeInReceiver());');
    });

    it('constructs capsules with the Scheduler and starts them, but omits the structural relation/print output', () => {
      const main = fileFor(files, 'Intersection.java');
      expect(main).toContain('Scheduler scheduler = new Scheduler();');
      expect(main).toContain('new TrafficLight(scheduler);');
      expect(main).toContain('northSouth.start();');
      expect(main).toContain('scheduler.run();');
      expect(main).not.toContain('Print object states');
    });
  });

  describe('all scope', () => {
    const files = generateJavaCode(metaModel, [im], 'all');

    it('includes both the structural print and the behavioural wiring/run in one main()', () => {
      const main = fileFor(files, 'Intersection.java');
      expect(main).toContain('Print object states');
      expect(main).toContain('Wire capsule connectors');
      expect(main).toContain('scheduler.run();');
    });
  });
});

// Regression: a received signal's parameter was declared in the generated
// receiver method's signature but its value was never stored or passed
// anywhere — any guard/effect referencing it (the normal way to model an
// event carrying data) failed to compile with "cannot find symbol".
// Regression: composition-relation instance links (e.g. a Game capsule that
// composition-owns two Player capsules) were only wired into the generated
// main() when scope === 'all' — the far more commonly used 'behavioural'
// scope silently left the container's list empty, even though the wiring is
// behaviourally load-bearing (a capsule's action code may iterate that list),
// not just informational print output. Also covers the companion fix: start()
// calls must respect composition containment (parts before their container).
describe('generateJavaCode — composition-relation wiring and capsule start order', () => {
  const metaModel = {
    kind: 'metamodel', name: 'Arena',
    classes: [
      { id: 'GM', name: 'Game', isAbstract: false, attributes: [], ports: [{ id: 'gLog', name: 'log', protocolId: 'sys-log', conjugated: false }] },
      { id: 'PL', name: 'Player', isAbstract: false, attributes: [], ports: [{ id: 'pLog', name: 'log', protocolId: 'sys-log', conjugated: false }] },
    ],
    relations: [
      { id: 'r1', kind: 'COMPOSITION', source: 'GM', target: 'PL', targetMultiplicity: '*' },
    ],
    enumerations: [],
    protocols: [],
    behaviours: {
      GM: { states: [{ id: 's1', kind: 'initial', name: '', entry: '', exit: '' }, { id: 's2', kind: 'simple', name: 'Running', entry: '', exit: '' }], transitions: [{ id: 't1', source: 's1', target: 's2', trigger: '', guard: '', effect: '' }] },
      PL: { states: [{ id: 's1', kind: 'initial', name: '', entry: '', exit: '' }, { id: 's2', kind: 'simple', name: 'Waiting', entry: '', exit: '' }], transitions: [{ id: 't1', source: 's1', target: 's2', trigger: '', guard: '', effect: '' }] },
    },
  };

  const im = {
    id: 'im1', kind: 'instancemodel', name: 'Match',
    objects: [
      { id: 'game', classId: 'GM', name: 'Game1', attributeValues: {} },
      { id: 'p1',   classId: 'PL', name: 'Player1', attributeValues: {} },
      { id: 'p2',   classId: 'PL', name: 'Player2', attributeValues: {} },
    ],
    links: [
      { id: 'l1', relationId: 'r1', source: 'game', target: 'p1' },
      { id: 'l2', relationId: 'r1', source: 'game', target: 'p2' },
    ],
    connectors: [],
  };

  it('wires composition links (addPlayerList) into behavioural-scope main(), not just structural/all', () => {
    const main = fileFor(generateJavaCode(metaModel, [im], 'behavioural'), 'Match.java');
    expect(main).toContain('game1.addPlayerList(player1);');
    expect(main).toContain('game1.addPlayerList(player2);');
  });

  it('starts contained (part) capsules before their composition-owner, in both scopes', () => {
    for (const scope of ['behavioural', 'all']) {
      const main = fileFor(generateJavaCode(metaModel, [im], scope), 'Match.java');
      const p1Idx   = main.indexOf('player1.start();');
      const p2Idx   = main.indexOf('player2.start();');
      const gameIdx = main.indexOf('game1.start();');
      expect(p1Idx).toBeGreaterThan(-1);
      expect(p2Idx).toBeGreaterThan(-1);
      expect(gameIdx).toBeGreaterThan(-1);
      expect(p1Idx).toBeLessThan(gameIdx);
      expect(p2Idx).toBeLessThan(gameIdx);
    }
  });
});

describe('generateJavaCode — signal parameters reach guards and effects', () => {
  const metaModel = {
    kind: 'metamodel', name: 'Bank',
    classes: [{
      id: 'AC', name: 'Account', isAbstract: false,
      attributes: [{ id: 'aBal', name: 'balance', type: 'INT', visibility: 'PUBLIC', lowerBound: 1, upperBound: 1, defaultValue: '0' }],
      ports: [{ id: 'pIn', name: 'ops', protocolId: 'proto1', conjugated: false }],
    }],
    relations: [], enumerations: [],
    protocols: [{
      id: 'proto1', name: 'banking',
      signals: [{ id: 'sig1', name: 'deposit', direction: 'in', params: [{ id: 'p1', name: 'amount', type: 'INT' }] }],
    }],
    behaviours: {
      AC: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sOpen', kind: 'simple', name: 'Open', entry: '', exit: '' },
          { id: 'sFlush', kind: 'simple', name: 'Flush', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sOpen', trigger: '', guard: '', effect: '' },
          // Guard AND effect both reference the signal's own param name directly.
          { id: 't1', source: 'sOpen', target: 'sFlush', trigger: 'ops.deposit', guard: 'amount >= 100', effect: 'balance += amount;' },
        ],
      },
    },
  };
  const files = generateJavaCode(metaModel, [], 'behavioural');
  const src = fileFor(files, 'Account.java');

  it('stores the parameter into a capsule field before calling dispatch', () => {
    expect(src).toMatch(/private int _arg_OPS_DEPOSIT_amount;/);
    expect(src).toMatch(/public void deposit\(int amount\) \{ _arg_OPS_DEPOSIT_amount = amount; dispatch\(Trigger\.OPS_DEPOSIT\); \}/);
  });

  it('declares a same-named local in dispatch() before the guard/effect that reference it', () => {
    const dispatchStart = src.indexOf('private void dispatch');
    const guardIdx  = src.indexOf('amount >= 100');
    const effectIdx = src.indexOf('balance += amount;');
    const localDeclIdx = src.indexOf('int amount = _arg_OPS_DEPOSIT_amount;');
    expect(localDeclIdx).toBeGreaterThan(dispatchStart);
    expect(localDeclIdx).toBeLessThan(guardIdx);
    expect(localDeclIdx).toBeLessThan(effectIdx);
  });

  it('does not declare a param field/local when a signal has no params (no regression on the common case)', () => {
    const noParamModel = {
      ...metaModel,
      protocols: [{ id: 'proto1', name: 'banking', signals: [{ id: 'sig1', name: 'deposit', direction: 'in', params: [] }] }],
      behaviours: {
        AC: {
          ...metaModel.behaviours.AC,
          transitions: metaModel.behaviours.AC.transitions.map((t) =>
            t.id === 't1' ? { ...t, guard: '', effect: '' } : t
          ),
        },
      },
    };
    const noParamFiles = generateJavaCode(noParamModel, [], 'behavioural');
    const noParamSrc = fileFor(noParamFiles, 'Account.java');
    expect(noParamSrc).not.toContain('_arg_');
    expect(noParamSrc).toContain('public void deposit() { dispatch(Trigger.OPS_DEPOSIT); }');
  });
});

// Regression: an ENUM-typed signal parameter's receiver method/field/dispatch
// local were all generated via the plain javaType(type) helper, which has no
// notion of enumId and silently falls back to "String" — real Java code that
// sent an actual enum constant through that signal wouldn't compile against
// the generated interface.
describe('generateJavaCode — an ENUM-typed signal parameter resolves to the enum class, not String', () => {
  const metaModel = {
    kind: 'metamodel', name: 'RPS',
    classes: [{
      id: 'PL', name: 'Player', isAbstract: false, attributes: [],
      ports: [{ id: 'pIn', name: 'game', protocolId: 'proto1', conjugated: false }],
    }],
    relations: [],
    enumerations: [{ id: 'eMove', name: 'Move', literals: ['ROCK', 'PAPER', 'SCISSORS'] }],
    protocols: [{
      id: 'proto1', name: 'RPS',
      signals: [{ id: 'sig1', name: 'sendMove', direction: 'in', params: [{ id: 'p1', name: 'move', type: 'ENUM', enumId: 'eMove' }] }],
    }],
    behaviours: {
      PL: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sWaiting', kind: 'simple', name: 'Waiting', entry: '', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sWaiting', trigger: '', guard: '', effect: '' },
          { id: 't1', source: 'sWaiting', target: 'sWaiting', trigger: 'game.sendMove', guard: '', effect: '' },
        ],
      },
    },
  };
  const files = generateJavaCode(metaModel, [], 'behavioural');

  it('types the receiver interface method with the enum class', () => {
    const receiver = fileFor(files, 'RPSReceiver.java');
    expect(receiver).toContain('default void sendMove(Move move) {}');
    expect(receiver).not.toContain('String move');
  });

  it('types the capsule field and dispatch-local with the enum class', () => {
    const src = fileFor(files, 'Player.java');
    expect(src).toMatch(/private Move _arg_GAME_SENDMOVE_move;/);
    expect(src).toContain('public void sendMove(Move move) { _arg_GAME_SENDMOVE_move = move; dispatch(Trigger.GAME_SENDMOVE); }');
    expect(src).toContain('Move move = _arg_GAME_SENDMOVE_move;');
  });
});

describe('generateJavaCode — a state machine on a portless class is not silently dropped', () => {
  const metaModel = {
    kind: 'metamodel', name: 'Counter',
    classes: [{
      id: 'CT', name: 'Counter', isAbstract: false,
      attributes: [{ id: 'aN', name: 'n', type: 'INT', visibility: 'PUBLIC', lowerBound: 1, upperBound: 1, defaultValue: '0' }],
      // No ports at all — isCapsuleClass() alone would gate this class out
      // of generateCapsuleBody entirely, discarding the whole state machine.
      ports: [],
    }],
    relations: [], enumerations: [], protocols: [],
    behaviours: {
      CT: {
        states: [
          { id: 'sInit', kind: 'initial', name: '', entry: '', exit: '' },
          { id: 'sRunning', kind: 'simple', name: 'Running', entry: 'n = n + 1;', exit: '' },
        ],
        transitions: [
          { id: 'tInit', source: 'sInit', target: 'sRunning', trigger: '', guard: '', effect: '' },
        ],
      },
    },
  };

  it('still emits the State/Trigger enums and dispatch/start methods', () => {
    const files = generateJavaCode(metaModel, [], 'behavioural');
    const src = fileFor(files, 'Counter.java');
    expect(src).toContain('enum State');
    expect(src).toContain('public void start()');
    expect(src).toContain('private void dispatch(');
  });
});
