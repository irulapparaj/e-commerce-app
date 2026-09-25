import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
        'src/money/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
        'src/tax/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
});
