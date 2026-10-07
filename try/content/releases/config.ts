import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Releases',
  description: 'Posts shown as a table: this config.ts names the table view.',
  kind: 'posts',
  view: 'venda.table',
  fields: {
    title: { type: 'text', required: true },
    version: { type: 'text' },
    body: { type: 'richtext', required: true }
  }
});
