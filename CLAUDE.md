# iml-studio

## What this is
IML Studio — a browser-based visual modeling and IDE tool. It lets users build UML-style class/object/state diagrams on a canvas, generate Java code from those models, and run the code in an embedded terminal. Likely used as an educational tool for teaching OOP/modeling.

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
  nodes/                — custom React Flow node types (Class, Enum, State, Object, Part, etc.)
  edges/                — custom React Flow edge types (Link, Relation, Transition, Connector)
  store/
    modelStore.js            — main diagram model state (meta-model, instances, protocols/ports)
    behaviourStore.js        — state machine editor view state
    capsuleStructureStore.js — capsule structure (parts + connectors) editor view state
    ideStore.js              — IDE/code editor state
    transformStore.js        — transform state
  utils/
    javaCodeGen.js      — generates Java source from the model
    javaRunner.js       — small fetch-based helper that pings/calls iml-java-runner
    conformance.js      — model conformance/validation checks
    modelHelpers.js     — shared model utility functions
    runTransform.js     — executes model transformations
```

## Important notes
- The Java execution backend is a **separate service**: `iml-java-runner` (deployed on Fly.io). The IDE's terminal (`src/components/ide/IDETerminal.jsx`) is the actual WebSocket client that streams compile/run output from it — `javaRunner.js` is a separate, smaller fetch-based helper
- Deployed as a **static site** on GitHub Pages (`https://prof-rapos.github.io`)
- Tests (`.test.js` files) live alongside the source files they test
- ES modules throughout (`"type": "module"` in package.json)
