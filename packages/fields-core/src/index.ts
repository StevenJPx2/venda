import type { AdminPlugin } from '@venda/admin';

// The default input for every field type a model can declare. Another plugin
// listed after this one replaces the input for the types it serves.
export default {
  id: 'venda.fields',
  fields: [
    {
      id: 'venda.field.text',
      label: 'Text',
      types: ['text', 'url', 'image', 'relation', 'date'],
      load: () => import('./TextInput.vue')
    },
    {
      id: 'venda.field.textarea',
      label: 'Text area',
      types: ['textarea'],
      load: () => import('./TextareaInput.vue')
    },
    {
      id: 'venda.field.number',
      label: 'Number',
      types: ['number'],
      load: () => import('./NumberInput.vue')
    },
    {
      id: 'venda.field.toggle',
      label: 'Toggle',
      types: ['boolean'],
      load: () => import('./ToggleInput.vue')
    },
    {
      id: 'venda.field.datetime',
      label: 'Date and time',
      types: ['datetime'],
      load: () => import('./DateTimeInput.vue')
    },
    {
      id: 'venda.field.tags',
      label: 'Tags',
      types: ['tags'],
      load: () => import('./TagsInput.vue')
    },
    {
      id: 'venda.field.select',
      label: 'Select',
      types: ['select'],
      load: () => import('./SelectInput.vue')
    },
    {
      id: 'venda.field.json',
      label: 'JSON',
      types: ['json'],
      load: () => import('./JsonInput.vue')
    },
    {
      id: 'venda.field.richtext',
      label: 'Rich text',
      types: ['richtext'],
      load: () => import('./RichTextInput.vue')
    }
  ]
} satisfies AdminPlugin;
