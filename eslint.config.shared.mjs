// Shared ESLint flat-config pieces for every Venda workspace package.
// Framework-agnostic: the Nuxt apps compose these via withNuxt(), the API
// Worker composes them via typescript-eslint.
import stylistic from '@stylistic/eslint-plugin';

export const sharedIgnores = [
  '**/.nuxt/**',
  '**/.output/**',
  '**/.wrangler/**',
  '**/dist/**',
  '**/node_modules/**'
];

export const sharedRules = {
  name: 'venda/rules',
  plugins: { '@stylistic': stylistic },
  rules: {
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': ['error', 'always'],
    eqeqeq: ['error', 'smart'],

    // Breathing room (the code-breathing-room skill): a braced block is its own
    // paragraph, scopes never start or end with a blank line, and one blank line
    // is the unit. One-line guards stay grouped; the rest of the grouping
    // (separating phases) is judgment, applied in review.
    '@stylistic/padding-line-between-statements': ['error',
      { blankLine: 'always', prev: '*', next: 'block-like' },
      { blankLine: 'always', prev: 'block-like', next: '*' }
    ],
    '@stylistic/padded-blocks': ['error', 'never'],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }]
  }
};
