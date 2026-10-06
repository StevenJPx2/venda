import type { AdminPlugin } from '@venda/admin';

export default {
  id: 'venda.content',
  pages: [
    { id: 'content.index', path: 'content', title: 'Content', section: 'content', access: 'signed-in', load: () => import('./ContentView.vue'), nav: { label: 'Content', icon: 'i-lucide-files' } },
    { id: 'content.collection', path: 'content/:collection', title: 'Content', section: 'content', access: 'signed-in', load: () => import('./ContentView.vue') },
    { id: 'content.entry', path: 'content/:collection/:slug', title: 'Entry', section: 'content', access: 'signed-in', load: () => import('./EntryView.vue') },
    { id: 'content.problems', path: 'settings/content-problems', title: 'Content problems', section: 'settings', access: 'administrator', load: () => import('./ProblemsView.vue'), nav: { label: 'Content problems', icon: 'i-lucide-file-warning' } }
  ]
} satisfies AdminPlugin;
