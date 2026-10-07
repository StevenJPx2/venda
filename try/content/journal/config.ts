import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Journal',
  description: 'Notes on building Venda, newest first.',
  kind: 'posts',
  fields: {
    title: { type: 'text', required: true, max: 80 },
    excerpt: { type: 'textarea', max: 200 },
    tags: { type: 'tags' },
    mood: { type: 'select', options: ['calm', 'curious', 'tired'] },
    body: { type: 'richtext', required: true }
  }
});
