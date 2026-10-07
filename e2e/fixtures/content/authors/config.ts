import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Authors',
  kind: 'records',
  titleField: 'name',
  fields: {
    name: { type: 'text', required: true },
    role: { type: 'text' },
    staff: { type: 'boolean', label: 'On staff' }
  }
});
