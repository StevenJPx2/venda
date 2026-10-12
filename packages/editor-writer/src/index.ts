import type { AdminPlugin } from '@venda/admin';

// The writer: what posts and pages open their entries in.
export default {
  id: 'venda.editor-writer',
  editors: [
    {
      id: 'venda.writer',
      label: 'Writer',
      kinds: ['posts', 'pages'],
      load: () => import('./WriterEditor.vue')
    }
  ]
} satisfies AdminPlugin;
