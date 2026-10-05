import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Field notes',
  kind: 'posts',
  fields: {
    title: { type: 'text', required: true },
    tags: { type: 'tags' },
    body: { type: 'richtext', required: true }
  }
});
