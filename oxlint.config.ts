import gdp from '@gdp-ts/core/lint/oxlint';
import { defineConfig } from 'oxlint';
import newArchitecture from './tools/new-architecture.json' with { type: 'json' };

// The other packages stay on ESLint only until their slice rewrites them.
const NEW_ARCHITECTURE = newArchitecture.packages.map(dir => `${dir}/**`);

// Capability proofs (gdp-ts): minted only in the core's proofs/ modules, never
// forged. Strict in the core and the server, where proofs are made and used:
// no `as` or `any` outside proofs/, so nothing can stand in for a proof.
const proofs = gdp({
  files: ['packages/core/**/*.ts', 'packages/server/**/*.ts'],
  proofs: ['packages/core/src/**/proofs/**'],
  strict: true,
  allowAssertions: []
});

export default defineConfig({
  ignorePatterns: [
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.cursor/**',
    '.opencode/**',
    'tools/oxlint/anti-slop/**',
    '**/.output/**',
    '**/.output-node/**',
    '**/.try/**',
    '**/.wrangler/**',
    '**/node_modules/**'
  ],
  jsPlugins: [
    { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
    { name: 'anti-slop-effect', specifier: './tools/oxlint/anti-slop/effect/index.ts' },
    ...proofs.jsPlugins
  ],
  overrides: [
    ...proofs.overrides,
    {
      files: NEW_ARCHITECTURE,
      rules: {
        'max-lines-per-function': ['error', { max: 70, skipBlankLines: true, skipComments: true }],
        'oxc/no-accumulating-spread': 'error',
        'anti-slop/no-array-filter-map': 'error',
        'anti-slop/no-reduce-accumulator-copy': 'error',
        'anti-slop/no-chained-type-assertions': 'error',
        'anti-slop/no-conditional-empty-object-spread': 'error',
        'anti-slop/no-known-value-widening': 'error',
        'anti-slop/no-module-mocking': 'error',
        'anti-slop/no-object-parameters': 'error',
        'anti-slop/no-reflect-apply': 'error',
        'anti-slop/no-reflect-get': 'error',
        'anti-slop/no-runtime-typeof': 'error',
        'anti-slop/no-shape-in-symbol-names': 'error',
        'anti-slop/no-unknown-parameters': 'error',
        'anti-slop/no-unknown-returns': 'error',
        'anti-slop/no-unknown-type-aliases': 'error',
        'anti-slop/no-unsafe-dictionary-type': 'error',
        'anti-slop/no-widen-then-assert': 'error',
        'anti-slop/require-readable-spacing': 'error',
        'anti-slop/require-safety-comment-for-type-assertion': 'error',
        'anti-slop-effect/no-manual-effect-error-tag': 'error',
        'anti-slop-effect/no-manual-tag-comparison': 'error',
        'anti-slop-effect/no-manual-tagged-construction': 'error',
        'anti-slop-effect/no-service-constructor-imports': 'error',
        'anti-slop-effect/prefer-effect-match': 'error'
      }
    }
  ]
});
