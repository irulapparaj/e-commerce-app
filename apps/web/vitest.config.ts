import react from '@vitejs/plugin-react';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

type PluginOption = NonNullable<ViteUserConfig['plugins']>[number];

/**
 * `.tsx` tests opt into jsdom with a `// @vitest-environment jsdom` docblock; everything else runs
 * in node. The React plugin is built against Vite 8 while Vitest 3 bundles Vite 7, so its type is
 * widened here; the runtime contract is unchanged.
 */
export default defineConfig({
  plugins: [react() as unknown as PluginOption],
  /** tsconfig uses `jsx: preserve` for Next; tests need the automatic runtime instead. */
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    name: 'web',
    environment: 'node',
    css: false,
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'stores/**/*.test.tsx',
      'middleware.test.ts',
    ],
    setupFiles: ['./test-setup.ts', './test-setup.dom.ts'],
    /** next-intl imports bare `next/server`, which Node's ESM resolver rejects when externalised. */
    server: { deps: { inline: ['next-intl'] } },
    coverage: {
      provider: 'v8',
      include: [
        'lib/**',
        'components/admin/**',
        'components/ui/**',
        'components/layout/**',
        'lib/api/**',
        'stores/**',
        'middleware.ts',
      ],
      exclude: [
        'lib/**/*.test.ts',
        'lib/**/*.test.tsx',
        'components/**/*.test.tsx',
        'stores/**/*.test.tsx',
        'lib/auth/session.ts',
        'lib/auth/client.ts',
        'lib/admin/server.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'components/ui/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        'components/layout/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        'lib/api/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
      },
    },
  },
  resolve: {
    alias: { '@': new URL('./', import.meta.url).pathname },
  },
});
