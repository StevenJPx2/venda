import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Authors',
  description: 'The people who write here, credited on their posts.',
  kind: 'records',
  titleField: 'name',
  fields: {
    name: { type: 'text', required: true },
    role: { type: 'text' },
    website: { type: 'url' },
    staff: { type: 'boolean', label: 'On staff' },
    bio: { type: 'textarea', max: 300 }
  }
});
