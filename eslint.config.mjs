import eslint from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/.next/**', '**/dist/**', '**/coverage/**', '**/next-env.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx}'],
  })),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: {
      react: {
        version: '19.2',
      },
    },
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
