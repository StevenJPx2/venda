import type { AdminPlugin } from '@venda/admin';
import { collectionLinks } from './collections';

// The content screens, and the default view and editor for each kind of
// collection. Another plugin listed after this one replaces a default for the
// kinds it serves; a collection's config.ts may name any installed one.
export default {
  id: 'venda.content',
  pages: [
    {
      id: 'content.index',
      path: 'content',
      title: 'Content',
      section: 'content',
      access: 'signed-in',
      load: () => import('./ContentView.vue'),
      description:
        'Writing, pages and structured content from your repository.',
      nav: { label: 'Content', icon: 'i-lucide-files', items: collectionLinks }
    },
    {
      id: 'content.collection',
      path: 'content/:collection',
      title: 'Content',
      section: 'content',
      access: 'signed-in',
      load: () => import('./CollectionScreen.vue')
    },
    {
      id: 'content.entry',
      path: 'content/:collection/:slug',
      title: 'Entry',
      section: 'content',
      access: 'signed-in',
      load: () => import('./EntryScreen.vue')
    },
    {
      id: 'site.general',
      path: 'settings/general',
      title: 'General',
      section: 'settings',
      access: 'administrator',
      load: () => import('./GeneralView.vue'),
      description:
        "The site's name and address, and the words each screen opens with.",
      nav: { label: 'General', icon: 'i-lucide-sliders-horizontal' }
    },
    {
      id: 'content.problems',
      path: 'settings/content-problems',
      title: 'Content problems',
      section: 'settings',
      access: 'administrator',
      load: () => import('./ProblemsView.vue'),
      description:
        'Files that could not be indexed. Fix the file in your repository; the next sync checks it again.',
      nav: { label: 'Content problems', icon: 'i-lucide-file-warning' }
    }
  ],
  views: [
    {
      id: 'venda.list',
      label: 'List',
      kinds: ['posts', 'pages'],
      load: () => import('./views/ListView.vue')
    },
    {
      id: 'venda.table',
      label: 'Table',
      kinds: ['records'],
      load: () => import('./views/TableView.vue')
    },
    {
      id: 'venda.single',
      label: 'Single entry',
      kinds: ['single'],
      load: () => import('./views/SingleView.vue')
    }
  ]
} satisfies AdminPlugin;
