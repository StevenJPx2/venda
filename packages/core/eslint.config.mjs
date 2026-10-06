import tseslint from 'typescript-eslint';
import { sharedIgnores, sharedRules } from '../../eslint.config.shared.mjs';

export default tseslint.config(
  { ignores: sharedIgnores },
  ...tseslint.configs.recommended,
  sharedRules,
  {
    // Sensitive functions take proofs they never read (gdp-ts): `_admin`, `_owns`.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' }
      ]
    }
  },
  {
    // Each proof is its own interface extending `Proof`, so TypeScript keeps proof kinds apart.
    files: ['src/**/proofs/**'],
    rules: {
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' }
      ]
    }
  }
);
