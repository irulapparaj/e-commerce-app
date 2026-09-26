import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
      exclude: ['lib/**/*.test.ts', 'lib/auth/session.ts', 'lib/auth/client.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
  resolve: {
    alias: { '@': new URL('./', import.meta.url).pathname },
  },
});
