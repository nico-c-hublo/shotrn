import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'backend/src/db/migrations/**',
    ],
  },
  js.configs.recommended,
  // Type-aware: catches unawaited promises and `any` flowing into typed code, which the
  // syntax-only rules cannot see (constitution II).
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Constitution II: `any` and unchecked casts require an explicit justification.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A supertest request is a thenable, not a Promise: without this, an unawaited
      // `request(app).get(...).expect(200)` never runs its assertion and passes silently.
      '@typescript-eslint/no-floating-promises': ['error', { checkThenables: true }],
      // NestJS's HttpStatus is a numeric enum used as named HTTP status constants;
      // comparing a response's numeric status with it is the intended use.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Rules of hooks and exhaustive effect dependencies: mistakes here fail at run time,
    // not at compile time, so only a linter catches them.
    files: ['frontend/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.tsx', 'backend/test/**/*.ts'],
    rules: {
      'no-console': 'off',
      // Response bodies from supertest and mocked fetch are untyped JSON by nature; the
      // tests exist to assert their shape. Promise rules such as no-floating-promises stay
      // on, because an unawaited assertion passes silently.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // `json: async () => body` is the natural shape of a mocked fetch response.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Plain JavaScript config files belong to no TypeScript project.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Tool config files run in Node with CommonJS globals.
    files: ['**/jest.config.js', '**/*.cjs'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
);
