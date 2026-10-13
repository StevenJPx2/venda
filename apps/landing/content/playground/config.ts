import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Playground',
  kind: 'records',
  fields: {
    title: { type: 'text', required: true },
    price: { type: 'number' },
    size: { type: 'select', options: ['s', 'm'] },
    cover: { type: 'image' }
  }
});
