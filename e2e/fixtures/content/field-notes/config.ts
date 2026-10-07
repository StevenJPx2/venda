import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Field notes',
  description: 'Short dispatches from the hills, written on the day.',
  kind: 'posts',
  fields: {
    title: { type: 'text', required: true },
    tags: { type: 'tags' },
    body: { type: 'richtext', required: true }
  }
});
