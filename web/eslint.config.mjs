import tsParser from '@typescript-eslint/parser';

import sudanPos from './eslint-rules/index.mjs';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'sudan-pos': sudanPos },
    rules: {
      'sudan-pos/no-physical-direction': 'error',
      'sudan-pos/no-literal-design-values': 'error',
      'sudan-pos/no-raw-strings': 'error',
      'sudan-pos/no-network-in-pos': 'error',
      'sudan-pos/domain-purity': 'error',
    },
  },
];
