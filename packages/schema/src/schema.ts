import { FIELD_INTERFACES, type CollectionSchema, type FieldChoice, type FieldDefinition, type FieldInterface } from './types';

export class SchemaError extends Error {
  override name = 'SchemaError';
}

const KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,63}$/;
const TITLE_INTERFACES: FieldInterface[] = ['input', 'textarea'];

// Collections created before field definitions stored a loose `{ key: type }` map.
const LEGACY_TYPES: Record<string, FieldInterface> = {
  string: 'input',
  text: 'textarea',
  markdown: 'wysiwyg',
  html: 'wysiwyg',
  number: 'number',
  boolean: 'toggle',
  'string[]': 'tags'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInterface(value: unknown): value is FieldInterface {
  return typeof value === 'string' && Object.hasOwn(FIELD_INTERFACES, value);
}

function optionalText(raw: Record<string, unknown>, name: string, key: string): string | undefined {
  const value = raw[name];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new SchemaError(`Field "${key}": ${name} must be text.`);
  return value.trim() || undefined;
}

function parseChoices(raw: unknown, key: string): FieldChoice[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new SchemaError(`Field "${key}": a dropdown needs at least one choice.`);

  const choices = raw.map((choice) => {
    const value = isRecord(choice) ? choice.value : choice;
    const label = isRecord(choice) ? choice.label : choice;
    if (typeof value !== 'string' || !value.trim()) throw new SchemaError(`Field "${key}": every choice needs a value.`);
    return { value: value.trim(), label: typeof label === 'string' && label.trim() ? label.trim() : value.trim() };
  });

  if (new Set(choices.map(c => c.value)).size !== choices.length) throw new SchemaError(`Field "${key}": choice values must be unique.`);
  return choices;
}

function parseField(raw: unknown): FieldDefinition {
  if (!isRecord(raw)) throw new SchemaError('Each field must be an object.');

  const key = raw.key;
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new SchemaError(`Invalid field key "${String(key)}": start with a lowercase letter and use letters, digits or underscores.`);
  }
  if (!isInterface(raw.interface)) throw new SchemaError(`Field "${key}": unknown interface "${String(raw.interface)}".`);

  const field: FieldDefinition = { key, interface: raw.interface };
  const label = optionalText(raw, 'label', key);
  const note = optionalText(raw, 'note', key);
  const placeholder = optionalText(raw, 'placeholder', key);
  if (label) field.label = label;
  if (note) field.note = note;
  if (placeholder) field.placeholder = placeholder;
  if (raw.required === true) field.required = true;
  if (raw.width === 'half') field.width = 'half';
  if (field.interface === 'dropdown') field.choices = parseChoices(raw.choices, key);

  return field;
}

function fromLegacy(map: Record<string, unknown>): CollectionSchema {
  const fields = Object.entries(map)
    .filter(([key]) => KEY_PATTERN.test(key))
    .map(([key, type]): FieldDefinition => ({ key, interface: LEGACY_TYPES[String(type)] ?? 'input' }));
  const titleField = ['title', 'name'].find(key => fields.some(f => f.key === key && TITLE_INTERFACES.includes(f.interface)));

  return titleField ? { version: 1, titleField, fields } : { version: 1, fields };
}

/** Validates a stored or submitted schema; legacy `{ key: type }` maps are upgraded. */
export function parseSchema(raw: unknown): CollectionSchema {
  if (raw === undefined || raw === null) return { version: 1, fields: [] };
  if (!isRecord(raw)) throw new SchemaError('Schema must be an object.');
  if (!Array.isArray(raw.fields)) return fromLegacy(raw);

  const fields = raw.fields.map(parseField);
  const keys = fields.map(f => f.key);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) throw new SchemaError(`Field key "${duplicate}" is used more than once.`);

  const schema: CollectionSchema = { version: 1, fields };
  if (raw.titleField !== undefined && raw.titleField !== null && raw.titleField !== '') {
    const title = fields.find(f => f.key === raw.titleField);
    if (!title || !TITLE_INTERFACES.includes(title.interface)) throw new SchemaError('The title field must be an existing input or textarea field.');
    schema.titleField = title.key;
  }

  return schema;
}

/** Directus-style label: explicit label, else the key in title case (`publishedAt` → "Published At"). */
export function fieldLabel(field: FieldDefinition): string {
  if (field.label) return field.label;
  const spaced = field.key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The first rich-text field, which the editor presents as the writing canvas. */
export function bodyField(schema: CollectionSchema): FieldDefinition | undefined {
  return schema.fields.find(f => f.interface === 'wysiwyg');
}

export function titleField(schema: CollectionSchema): FieldDefinition | undefined {
  return schema.titleField ? schema.fields.find(f => f.key === schema.titleField) : undefined;
}
