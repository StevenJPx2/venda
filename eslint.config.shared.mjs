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
      { blankLine: 'always', prev: 'block-like', next: '*' },
      { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] }
    ],
    '@stylistic/padded-blocks': ['error', 'never'],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }]
  }
};

// Template breathing room: expand containers and custom components; keep text
// and inline phrases compact. Multiline sibling sections get one blank line,
// while adjacent leaf controls may stay grouped. No blank line at scope edges.
export const sharedTemplateRules = {
  name: 'venda/template-rhythm',
  files: ['**/*.vue'],
  rules: {
    'vue/html-indent': ['error', 2],
    'vue/padding-line-between-tags': ['error', [
      { blankLine: 'always', prev: '*', next: '*:multi-line' },
      { blankLine: 'always', prev: '*:multi-line', next: '*' }
    ]],
    'vue/multiline-html-element-content-newline': ['error', { ignores: ['pre', 'textarea'], allowEmptyLines: true }],
    'vue/singleline-html-element-content-newline': ['error', {
      ignoreWhenNoAttributes: false,
      ignoreWhenEmpty: true,
      ignores: ['a', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'dt', 'dd', 'label', 'strong', 'em', 'code', 'pre', 'textarea', 'button', 'NuxtLink', 'UButton']
    }]
  }
};
