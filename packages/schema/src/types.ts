/**
 * How a field is edited in the admin, Directus-style. The interface also fixes
 * the stored JSON shape, so there is no separate "type" to keep in sync.
 */
export const FIELD_INTERFACES = {
  input: { label: 'Input', description: 'Single line of text', value: 'string' },
  textarea: { label: 'Textarea', description: 'Multiple lines of plain text', value: 'string' },
  wysiwyg: { label: 'Rich text', description: 'WYSIWYG editor, stored as HTML', value: 'string' },
  number: { label: 'Number', description: 'Integer or decimal', value: 'number' },
  toggle: { label: 'Toggle', description: 'On / off', value: 'boolean' },
  datetime: { label: 'Date & time', description: 'Stored as an ISO 8601 string', value: 'string' },
  dropdown: { label: 'Dropdown', description: 'One value from a fixed list', value: 'string' },
  tags: { label: 'Tags', description: 'List of short strings', value: 'string[]' },
  image: { label: 'Image', description: 'Uploaded to R2, stored as a URL', value: 'string' },
  code: { label: 'JSON', description: 'Any JSON value', value: 'json' }
} as const;

export type FieldInterface = keyof typeof FIELD_INTERFACES;

export interface FieldChoice {
  value: string;
  label: string;
}

export interface FieldDefinition {
  /** Unique key inside `entry.data`; immutable once content exists. */
  key: string;
  interface: FieldInterface;
  label?: string;
  note?: string;
  placeholder?: string;
  /** Enforced when an entry is published; drafts may be incomplete. */
  required?: boolean;
  width?: 'half' | 'full';
  /** Allowed values for `dropdown` fields. */
  choices?: FieldChoice[];
}

export interface CollectionSchema {
  version: 1;
  /** Field that names an item (Directus' display template); an input or textarea. */
  titleField?: string;
  fields: FieldDefinition[];
}

export interface FieldError {
  field: string;
  message: string;
}
