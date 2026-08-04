# iml-studio

## What this is
IML Studio — a browser-based visual modeling and IDE tool for teaching Model-Driven Engineering (MDE) in UML-RT style. It lets users build class/capsule/state-machine diagrams on a canvas, generate real Java from those models, run the code in an embedded terminal, and generate model-based tests via symbolic execution over a capsule's state machine.

## Status
Feature-complete across all 5 planned modules as of 2026-07-28, with several rounds of real-use polish since (most recently 2026-07-30): Structural Modeling, Model Transformations, Behavioural Modeling (+ Java codegen), Code Explorer/IDE, and Model-Based Testing. 234 Vitest tests. Ongoing work from here is quality-of-life and bugfixes, not new modules.

## Tech stack
- **Framework:** React 19 + Vite
- **Canvas/diagramming:** React Flow (`@xyflow/react`)
- **State management:** Zustand (multiple stores)
- **Code editor:** Monaco Editor (`@monaco-editor/react`)
- **Terminal:** xterm.js (`@xterm/xterm`) — connects to `iml-java-runner` backend
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest
- **Deployment:** GitHub Pages (`deploy.yml`)

## Running locally
```bash
npm run dev       # Vite dev server
npm run build     # production build to dist/
npm run test      # Vitest watch
npm run test:run  # Vitest single run
npm run lint      # ESLint
```

## Key structure
```
src/
  App.jsx               — root component, switches between views
  components/
    ModelCanvas.jsx     — React Flow canvas (main diagram view)
    Sidebar.jsx         — node palette / toolbox
    Topbar.jsx          — toolbar actions
    PropertiesPanel.jsx — selected node/edge properties
    ide/                — IDE view (code editor + terminal)
    transform/          — model transform view
    behaviour/          — behavioural view (state machines + capsule structure diagrams)
    mbt/                — Model-Based Testing view (SET Viewer / Test Case Explorer / Generated Code panels)
  nodes/                — custom React Flow node types (Class, Enum, State, Object, Part, SETNode, etc.)
  edges/                — custom React Flow edge types (Link, Relation, Transition, Connector, SETEdge)
  store/
    modelStore.js            — main diagram model state (meta-model, instances, protocols/ports)
    behaviourStore.js        — state machine editor view state
    capsuleStructureStore.js — capsule structure (parts + connectors) editor view state
    ideStore.js              — IDE/code editor state
    transformStore.js        — transform state
    mbtStore.js              — Model-Based Testing view state (builds/holds the Symbolic Execution Tree)
  utils/
    javaCodeGen.js      — generates Java source from the model (structural/behavioural/all scopes)
    conformance.js      — model conformance/validation checks
    modelHelpers.js     — shared model utility functions
    runTransform.js     — executes model transformations
    symbolicExecution.js — subsumption-based symbolic execution engine (builds the SET)
    actionInterpreter.js — interprets a small subset of action code / guards for attribute tracking
    treeLayout.js        — hand-rolled tree layout for the SET
    mbtCodeGen.js         — generates abstract + concrete (Java) test cases from the SET
```

## Important notes
- The Java execution backend is a **separate service**: `iml-java-runner` (deployed on Fly.io). The IDE's terminal (`src/components/ide/IDETerminal.jsx`) is the actual WebSocket client that streams compile/run output from it
- Deployed as a **static site** on GitHub Pages (`https://prof-rapos.github.io`)
- Tests (`.test.js` files) live alongside the source files they test
- ES modules throughout (`"type": "module"` in package.json)
