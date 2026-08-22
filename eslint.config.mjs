import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated code and build output are never linted.
    ignores: ['dist/**', 'src/generated/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        NodeJS: 'readonly',
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['error'] }],
      'prefer-const': 'error',
      'no-unused-expressions': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // CLI scripts print to the terminal, that is their whole job.
    files: [
      'scripts/**/*.ts',
      'scripts/**/*.mjs',
      'src/scripts/**/*.ts',
      'prisma/seed.ts',
    ],
    languageOptions: {
      globals: { fetch: 'readonly', process: 'readonly', console: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  },
  // `prettier` must stay last so formatting rules never fight the formatter.
  prettier,
);
