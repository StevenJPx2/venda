// What the form editor shows for each field of an entry, in config.ts order:
// a control that matches the field's type, filled with the entry's value.
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { isRichTextDoc, type RichTextDoc } from '@venda/richtext';
import { Predicate } from 'effect';
import { fieldLabel } from './table';
import { cellText as text } from './text';

export type FormControl =
  | { readonly kind: 'richtext'; readonly doc: RichTextDoc | null }
  | { readonly kind: 'switch'; readonly on: boolean }
  | { readonly kind: 'tags'; readonly tags: ReadonlyArray<string> }
  | { readonly kind: 'textarea'; readonly text: string }
  | { readonly kind: 'text'; readonly text: string };

export interface FormRow {
  readonly key: string;
  readonly label: string;
  readonly control: FormControl;
}

type Value = IndexedEntry['data'][string] | undefined;

// Field types with a control of their own; every other type is a text input.
const controls = new Map<string, (value: Value) => FormControl>([
  [
    'richtext',
    value => ({ kind: 'richtext', doc: isRichTextDoc(value) ? value : null })
  ],
  ['boolean', value => ({ kind: 'switch', on: value === true })],
  [
    'tags',
    value => ({
      kind: 'tags',
      tags: Array.isArray(value) ? value.filter(Predicate.isString) : []
    })
  ],
  ['textarea', value => ({ kind: 'textarea', text: text(value) })]
]);

const textControl = (value: Value): FormControl => ({
  kind: 'text',
  text: text(value)
});

export const formRows = (
  collection: CollectionSummary,
  entry: IndexedEntry
): FormRow[] =>
  collection.fields.map(field => {
    const value = entry.data[field.key];
    const control = (controls.get(field.type) ?? textControl)(value);

    return { key: field.key, label: fieldLabel(field), control };
  });
