import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Pages',
  kind: 'pages',
  fields: {
    title: { type: 'text', required: true, max: 80 },
    body: { type: 'richtext', required: true }
  }
});
