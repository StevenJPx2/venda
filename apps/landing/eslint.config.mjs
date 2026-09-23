import withNuxt from './.nuxt/eslint.config.mjs';
import { sharedIgnores, sharedRules } from '../../eslint.config.shared.mjs';

export default withNuxt(
  { ignores: sharedIgnores },
  sharedRules,
  {
    // Nuxt route + root components are single-word by convention.
    files: ['app/pages/**/*.vue', 'app/app.vue', 'app/error.vue'],
    rules: { 'vue/multi-word-component-names': 'off' }
  }
);
