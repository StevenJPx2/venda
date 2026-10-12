import type { AdminPlugin } from '@venda/admin';

// The form editor: what single and records collections open their entries in.
export default {
  id: 'venda.editor-form',
  editors: [
    {
      id: 'venda.form',
      label: 'Form',
      kinds: ['single', 'records'],
      load: () => import('./FormEditor.vue')
    }
  ]
} satisfies AdminPlugin;
