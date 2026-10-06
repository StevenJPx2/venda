// Shared ESLint flat-config pieces for every Venda workspace package.
// Framework-agnostic: the Nuxt apps compose these via withNuxt(), the API
// Worker composes them via typescript-eslint.
//
// Prettier owns layout: indentation, wrapping and line breaks. ESLint keeps
// only the blank-line rhythm, which Prettier preserves but never adds.
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';

export const sharedIgnores = [
  '**/.nuxt/**',
  '**/.output/**',
  '**/.try/**',
  '**/.wrangler/**',
  '**/dist/**',
  '**/node_modules/**'
];

export const sharedRules = {
  name: 'venda/rules',
  plugins: { '@stylistic': stylistic },
  rules: {
    ...prettier.rules,
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': ['error', 'always'],
    eqeqeq: ['error', 'smart'],

    // Breathing room (the code-breathing-room skill): every `if`, one-line guards
    // included, and every braced block is its own paragraph; a run of one-line
    // guards reads as one paragraph. Prettier removes blank lines at scope edges
    // and collapses runs of them. Grouping the remaining statements by phase is
    // judgment, applied in review. The last matching entry wins.
    '@stylistic/padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: '*', next: 'if' },
      { blankLine: 'always', prev: 'if', next: '*' },
      { blankLine: 'any', prev: 'if', next: 'if' },
      { blankLine: 'always', prev: '*', next: 'block-like' },
      { blankLine: 'always', prev: 'block-like', next: '*' },
      {
        blankLine: 'any',
        prev: ['const', 'let', 'var'],
        next: ['const', 'let', 'var']
      }
    ]
  }
};

// Template breathing room: multiline sibling sections get one blank line, while
// adjacent leaf controls may stay grouped. Prettier decides how tags wrap.
export const sharedTemplateRules = {
  name: 'venda/template-rhythm',
  files: ['**/*.vue'],
  rules: {
    ...prettier.rules,
    'vue/padding-line-between-tags': [
      'error',
      [
        { blankLine: 'always', prev: '*', next: '*:multi-line' },
        { blankLine: 'always', prev: '*:multi-line', next: '*' }
      ]
    ]
  }
};
