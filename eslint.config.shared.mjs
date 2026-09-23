// Shared ESLint flat-config pieces for every Venda workspace package.
// Framework-agnostic: the Nuxt apps compose these via withNuxt(), the API
// Worker composes them via typescript-eslint.

export const sharedIgnores = [
  '**/.nuxt/**',
  '**/.output/**',
  '**/.wrangler/**',
  '**/dist/**',
  '**/node_modules/**'
];

export const sharedRules = {
  name: 'venda/rules',
  rules: {
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': ['error', 'always'],
    eqeqeq: ['error', 'smart']
  }
};
