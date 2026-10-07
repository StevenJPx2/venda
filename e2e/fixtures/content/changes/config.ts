import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Changes',
  kind: 'posts',
  // No installed plugin provides this view: the admin says so and lists the posts.
  view: 'acme.timeline',
  fields: {
    title: { type: 'text', required: true },
    body: { type: 'richtext', required: true }
  }
});
