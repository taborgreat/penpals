// One style for the law, the backend and the frontend (cleanup-and-speed.md §5):
// ESLint for mistakes, Prettier (.prettierrc.json) for the shape of the code.
// Law v1 is frozen and the generated tables are generated: neither is touched.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'frontend/public/**',
      'law/v1/**',
      'law/v2/tables.js',
      'law/fixtures/**',
      'law/lab/samples/**',
      '5-steps/**',
      '6-steps/**',
      'frontend/src/scene/light/**',
      'frontend/scripts/**',
      'frontend/e2e/grower.mjs', // (light-waves: its own until integrated)
    ],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.jsx'],
    plugins: { react },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: '19' } },
    rules: { 'react/jsx-uses-vars': 'error', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
];
