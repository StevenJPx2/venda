import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Home',
  description: 'The front page: one entry, edited as a form.',
  kind: 'single',
  titleField: 'headline',
  fields: {
    headline: { type: 'text', required: true, max: 80 },
    intro: { type: 'textarea', label: 'Introduction', max: 280 },
    showLatest: { type: 'boolean', label: 'Show the latest posts' },
    topics: { type: 'tags' },
    body: { type: 'richtext' }
  }
});
