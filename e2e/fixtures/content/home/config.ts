import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Home',
  kind: 'single',
  titleField: 'headline',
  fields: {
    headline: { type: 'text', required: true },
    intro: { type: 'textarea', label: 'Introduction' }
  }
});
