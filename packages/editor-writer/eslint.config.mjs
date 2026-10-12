import withNuxt from '../../apps/admin/.nuxt/eslint.config.mjs';
import {
  sharedIgnores,
  sharedRules,
  sharedTemplateRules
} from '../../eslint.config.shared.mjs';

export default withNuxt(
  { ignores: sharedIgnores },
  sharedRules,
  sharedTemplateRules
);
