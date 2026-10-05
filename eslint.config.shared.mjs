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

    // Breathing room (the code-breathing-room skill): every `if`, one-line guards
    // included, and every braced block is its own paragraph; a run of one-line
    // guards reads as one paragraph. Scopes never start or end with a blank
    // line, and one blank line is the unit. Grouping the remaining statements by
    // phase is judgment, applied in review. The last matching entry wins.
    '@stylistic/padding-line-between-statements': ['error',
      { blankLine: 'always', prev: '*', next: 'if' },
      { blankLine: 'always', prev: 'if', next: '*' },
      { blankLine: 'any', prev: 'if', next: 'if' },
      { blankLine: 'always', prev: '*', next: 'block-like' },
      { blankLine: 'always', prev: 'block-like', next: '*' }
    ],
    '@stylistic/padded-blocks': ['error', 'never'],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }]
  }
};
