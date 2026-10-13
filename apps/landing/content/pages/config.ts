import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Pages',
  kind: 'pages',
  fields: {
    title: { type: 'text', required: true },
    body: { type: 'richtext' },
    headline: {
      type: 'text',
      help: 'Small label above the title (home page).'
    },
    description: {
      type: 'textarea',
      help: 'Lead paragraph (home page).'
    }
  }
});
