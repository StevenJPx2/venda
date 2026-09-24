import globals from 'globals';
import tseslint from 'typescript-eslint';
import { sharedIgnores, sharedRules } from '../../eslint.config.shared.mjs';

export default tseslint.config(
  { ignores: [...sharedIgnores, 'server/**'] },
  ...tseslint.configs.recommended,
  sharedRules,
  { languageOptions: { globals: globals.node } }
);
