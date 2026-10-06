# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (2026-10-05)
- Installed with the upstream `install-anti-slop` skill's `scripts/install.mjs`.
  The copy is identical to that commit's `src/` without its `*.test.ts` files.
- Plugins registered in `oxlint.config.ts`: `./tools/oxlint/anti-slop/index.ts`
  (generic rules) and `./tools/oxlint/anti-slop/effect/index.ts` (Effect rules;
  Venda depends on `effect` directly).
- Licence: MIT (`LICENSE`); the vendored ESLint Stylistic code keeps its own
  licence and provenance in `vendor/eslint-stylistic/`.

## Local deviations

Every generic and Effect rule is enabled at `error`. One rule is changed:

- `rules/require-readable-spacing.ts` allows an `if` straight after an `if`,
  so consecutive guards stay grouped as one paragraph. This matches the
  breathing-room rule in `eslint.config.shared.mjs`.
- The same rule allows consecutive variable declarations to stay grouped,
  including module-level declarations, as the code-breathing-room skill requires.

Scope is a Venda policy, not a change to the rules: Oxlint covers the packages
listed in `oxlint.config.ts`, which grows as each package moves onto the new
architecture (docs/architecture.md). Packages awaiting their rewrite stay on
ESLint only.
