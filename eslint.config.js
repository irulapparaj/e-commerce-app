import { createEslintConfig } from '@pe/config/eslint';

const HEX_COLOUR = '#[0-9a-fA-F]{3,8}\\b';
const HEX_MESSAGE =
  'Colour literals live in apps/web/styles/tokens.css and skins.css only; use a token (var(--…)) or a Tailwind colour class.';

/** DESIGN.md §16: one palette, defined once. Storefront and admin code must reference tokens. */
const noHexColoursInWeb = {
  files: ['apps/web/components/**/*.{ts,tsx}', 'apps/web/app/**/*.{ts,tsx}'],
  ignores: ['apps/web/app/**/dev/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      { selector: `Literal[value=/${HEX_COLOUR}/]`, message: HEX_MESSAGE },
      { selector: `TemplateElement[value.raw=/${HEX_COLOUR}/]`, message: HEX_MESSAGE },
    ],
  },
};

/** Perf scripts use plain JS and are not part of the TS project service. */
const perfIgnores = {
  ignores: ['tests/perf/*.js'],
};

export default [
  ...createEslintConfig({ tsconfigRootDir: import.meta.dirname }),
  noHexColoursInWeb,
  perfIgnores,
];
