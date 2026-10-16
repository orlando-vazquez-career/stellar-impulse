import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/tests/unit/**/*.test.ts',
      'apps/**/tests/unit/**/*.test.ts',
      // Map-authored suites remain with their isolated Tiled projects.
      'packages/sim/src/tiled-maps/**/logica/test/**/*.test.ts',
    ],
    testTimeout: 10000,
  },
});
