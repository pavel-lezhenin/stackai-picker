import { resolve } from 'path';

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Only run integration tests — no unit/component tests yet
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    // Real HTTP calls need generous timeouts
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Load .env.local before any test file
    setupFiles: ['tests/integration/setup.ts'],
    reporters: ['verbose'],
    // Run files sequentially so KB lifecycle tests don't race
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
