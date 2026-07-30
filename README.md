# IML Studio

A browser-based visual modeling and IDE tool for teaching Model-Driven Engineering (MDE) in UML-RT style. Build class/capsule diagrams and state machines on a canvas, generate real Java from the model, run it in an embedded terminal, and generate model-based tests via symbolic execution — all without installing anything.

Live at **https://prof-rapos.github.io/iml/**

## Status

Feature-complete across all five planned modules (2026-07-28), with several rounds of real-use fixes and polish since (latest: 2026-07-30). See `CLAUDE.md` for architecture notes.

- **Module 1 — Structural Modeling**: meta-model editor (classes, attributes, relations, enumerations), instance models, live conformance checking, `.iml.json` export/import, Java codegen.
- **Module 2 — Model Transformations**: rule-based model-to-model transformations, including expression mappings.
- **Module 3 — Behavioural Modeling**: capsules, ports, protocols, and state machines in UML-RT style, plus Java codegen for a real running simulation (single-threaded event loop, real-time timers).
- **Module 4 — Code Explorer**: an in-browser IDE (Monaco editor + xterm.js terminal) that compiles and runs generated Java via a companion service (`iml-java-runner`, deployed separately on Fly.io).
- **Module 5 — Model-Based Testing**: subsumption-based symbolic execution over a capsule's state machine, producing a browsable Symbolic Execution Tree; generates human-readable and real Java test cases per path, plus a full path-coverage test suite.

## Running locally

```bash
npm install
npm run dev       # Vite dev server
```

```bash
npm run build     # production build to dist/
npm run test:run  # Vitest, single run (234 tests)
npm run lint      # ESLint
```

## Tech stack

React 19 + Vite, React Flow (`@xyflow/react`) for all canvases, Zustand for state, Monaco Editor + xterm.js for the IDE view, Tailwind CSS v4, Vitest. Deployed as a static site on GitHub Pages; Java execution is the only part that talks to an external service.

## Project structure

See `CLAUDE.md` for the full breakdown of `src/` (components, stores, node/edge types, codegen utilities) and the notes on how each module's engine works.
