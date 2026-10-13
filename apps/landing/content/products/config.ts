import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Products',
  kind: 'records',
  titleField: 'name',
  fields: {
    name: { type: 'text', required: true },
    price: { type: 'number', required: true },
    currency: { type: 'select', options: ['USD', 'EUR', 'GBP'] },
    inStock: { type: 'boolean', label: 'In stock' },
    launchedAt: { type: 'datetime', label: 'Launched' },
    description: { type: 'textarea' },
    photo: { type: 'image' }
  }
});
