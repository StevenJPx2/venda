import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Steps',
  kind: 'records',
  fields: {
    title: { type: 'text', required: true },
    description: { type: 'textarea', required: true },
    order: { type: 'number', help: 'Lower numbers appear first.' }
  }
});
