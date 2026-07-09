# Testing IML Studio

The project uses [Vitest](https://vitest.dev/) for unit tests. Vitest reuses the
existing Vite config, so there is nothing extra to configure.

## Running tests

```bash
npm test          # watch mode — re-runs on file changes (use while developing)
npm run test:run  # single run — exits with a non-zero code on failure (use in CI)
```

## What is tested

We test the **pure logic** — the deterministic input → output functions that hold
the modelling semantics. This is where bugs are subtle and regressions are costly,
and it needs no browser or React to exercise. The UI components are intentionally
left out; they are thin wrappers over this logic.

| File | Covers |
|------|--------|
| `src/utils/modelHelpers.test.js`  | inheritance-aware attribute collection, and the full type-conversion matrix (BOOLEAN ↔ INT/DOUBLE, STRING → INT/DOUBLE/BOOLEAN with default fallback) |
| `src/utils/runTransform.test.js`  | M2M transform coercion (type + multiplicity), layout carry-over, link endpoint/handle rewriting, rule-based object selection |
| `src/utils/javaCodeGen.test.js`   | generated Java structure: packages, inheritance, type mapping, multi-valued attributes, getters/setters |

## Conventions

- Tests live **next to the code** they cover, named `<file>.test.js`.
- Each test builds the **smallest meta-model / instance model** that exercises the
  behaviour, inline in the test file. We deliberately avoid sharing large fixtures
  so each test reads as a self-contained example.
- Several tests are **regression guards** — they encode a specific bug that was
  fixed (e.g. a `BOOLEAN [1..2]` attribute mapped into an `INT [1..1]` target must
  produce `"1"`, not `["true","false"]`). Keep these; they document intent.

## Adding a test

1. Create or open `<module>.test.js` beside the source file.
2. `import { describe, it, expect } from 'vitest';`
3. Build a minimal model, call the function, assert on the result.

```js
import { describe, it, expect } from 'vitest';
import { convertSingle } from './modelHelpers.js';

describe('convertSingle', () => {
  it('maps BOOLEAN true to INT 1', () => {
    expect(convertSingle('true', 'BOOLEAN', 'INT')).toBe('1');
  });
});
```
