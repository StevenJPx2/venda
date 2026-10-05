import tseslint from 'typescript-eslint';
import { sharedIgnores, sharedRules } from '../../eslint.config.shared.mjs';

export default tseslint.config(
  { ignores: [...sharedIgnores, '**/.output-node/**'] },
  ...tseslint.configs.recommended,
  sharedRules
);
