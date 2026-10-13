import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Features',
  kind: 'records',
  fields: {
    title: { type: 'text', required: true },
    description: { type: 'textarea', required: true },
    icon: { type: 'text', help: 'Any Lucide icon name, e.g. i-lucide-zap.' },
    order: { type: 'number', help: 'Lower numbers appear first.' }
  }
});
