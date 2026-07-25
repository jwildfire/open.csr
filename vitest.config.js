import { defineConfig } from 'vitest/config';

// One suite for the whole repo. Every agent's unit tests live in tests/unit/,
// either as a flat `<module>-<topic>.test.js` or under `tests/unit/<module>/`,
// and scripts/evidence-lib.mjs routes them to their module by that path — so
// the include glob has to pick up both shapes.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.test.mjs'],
    exclude: ['node_modules/**', 'site/_build/**', 'outputs/**'],
    environment: 'node',
    reporters: ['default'],
    globals: false
  }
});
