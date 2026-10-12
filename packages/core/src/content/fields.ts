// A model's field as the admin lays it out: its label and help, and the rules
// its input follows (required, a select's choices, a number's or text's bounds).
import { CollectionField } from '@venda/contract';
import type { Field } from '@venda/content';

/** The bounds a field's input enforces: a number's value, or a text's length. */
function boundsOf(field: Field) {
  if (field.type === 'number')
    return { min: field.min ?? null, max: field.max ?? null };

  if (field.type === 'text' || field.type === 'textarea')
    return { min: null, max: field.max ?? null };

  return { min: null, max: null };
}

export const collectionField = (key: string, field: Field) =>
  new CollectionField({
    key,
    type: field.type,
    label: field.label ?? null,
    help: field.help ?? null,
    required: field.required === true,
    options: field.type === 'select' ? field.options : null,
    ...boundsOf(field)
  });
