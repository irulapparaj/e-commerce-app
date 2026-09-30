import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactPlugin from 'eslint-plugin-react';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SOFT_MAX_LINES = 400;
const HARD_MAX_LINES = 800;
const MAX_FUNCTION_LINES = 50;

const localPlugin = {
  rules: {
    'max-lines-soft': builtinRules.get('max-lines'),
  },
};

const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/coverage-int/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/*.config.js',
  '**/*.config.mjs',
  '**/*.config.cjs',
  '**/next-env.d.ts',
  '**/generated/**',
  'apps/api/prisma/migrations/**',
  'scripts/**',
];

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export function createEslintConfig({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
    {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node, ...globals.browser },
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: { local: localPlugin },
      settings: {
        'import-x/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'tsconfig.json'],
          },
          node: true,
        },
      },
      rules: {
        'no-param-reassign': 'error',
        'prefer-const': 'error',
        'no-console': ['error', { allow: ['warn', 'error'] }],
        'max-lines': ['error', { max: HARD_MAX_LINES, skipBlankLines: true, skipComments: true }],
        'local/max-lines-soft': [
          'warn',
          { max: SOFT_MAX_LINES, skipBlankLines: true, skipComments: true },
        ],
        'max-lines-per-function': [
          'warn',
          { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true, IIFEs: true },
        ],
        'max-depth': ['error', 4],
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
        'import-x/no-unresolved': 'off',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        '@typescript-eslint/require-await': 'off',
      },
    },
    {
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/test/**/*.ts',
        '**/tests/**/*.ts',
        '**/prisma/seed.ts',
      ],
      rules: {
        'max-lines-per-function': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['**/*.tsx'],
      plugins: { react: reactPlugin },
      settings: { react: { version: 'detect' } },
      rules: {
        'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
        'react/no-danger': 'error',
        'react/no-array-index-key': 'warn',
      },
    },
    prettier,
  );
}
