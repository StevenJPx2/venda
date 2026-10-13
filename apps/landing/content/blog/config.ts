import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Blog Posts',
  kind: 'posts',
  fields: {
    title: { type: 'text', label: 'Title', required: true },
    body: { type: 'richtext', label: 'Body', required: true },
    excerpt: {
      type: 'textarea',
      label: 'Excerpt',
      help: 'A short summary shown on the blog index.'
    },
    tags: { type: 'tags', label: 'Tags' },
    featured: { type: 'boolean', label: 'Featured' },
    featureImage: { type: 'image', label: 'Feature image' }
  }
});
