import globals from 'globals';
import { sharedIgnores, sharedRules } from './eslint.config.shared.mjs';

// Root config: lints workspace-level scripts only. Each app owns its own
// eslint.config.mjs (the Nuxt apps need their generated project-aware config),
// so they are ignored here and linted from their own directory.
export default [
  { ignores: [...sharedIgnores, 'apps/**', 'packages/**'] },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 'latest', globals: globals.node },
    rules: sharedRules.rules
  }
];
