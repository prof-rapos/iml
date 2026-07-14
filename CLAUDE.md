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
    BottomPanel.jsx     — bottom panel
    JavaRunnerPanel.jsx — embedded terminal for running Java
    ide/                — IDE view (code editor)
    transform/          — model transform view
    behaviour/          — behavioural/state machine view
  nodes/                — custom React Flow node types (Class, Enum, State, Object, etc.)
  edges/                — custom React Flow edge types (Link, Relation, Transition)
  store/
    modelStore.js       — main diagram model state
    behaviourStore.js   — state machine/behaviour state
    ideStore.js         — IDE/code editor state
    transformStore.js   — transform state
  utils/
    javaCodeGen.js      — generates Java source from the model
    javaRunner.js       — WebSocket client connecting to iml-java-runner
    conformance.js      — model conformance/validation checks
    modelHelpers.js     — shared model utility functions
    runTransform.js     — executes model transformations
```

## Important notes
- The Java execution backend is a **separate service**: `iml-java-runner` (deployed on Fly.io). `javaRunner.js` connects to it via WebSocket
- Deployed as a **static site** on GitHub Pages (`https://prof-rapos.github.io`)
- Tests (`.test.js` files) live alongside the source files they test
- ES modules throughout (`"type": "module"` in package.json)
