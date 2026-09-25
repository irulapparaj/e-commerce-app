import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api-int',
    environment: 'node',
    include: ['test/int/**/*.test.ts', 'test/security/**/*.test.ts'],
    globalSetup: ['test/helpers/containers.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
  },
});
