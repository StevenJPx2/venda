import { fieldLabel } from './schema';
import type { CollectionSchema, FieldDefinition, FieldError } from './types';

function htmlIsBlank(html: string): boolean {
  return !html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() && !/<(img|hr)\b/i.test(html);
}

/** A value that counts as "not filled in" for required checks. */
export function isEmptyValue(field: FieldDefinition, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return field.interface === 'wysiwyg' ? htmlIsBlank(value) : !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns a human-readable problem with a present value, or null when it is valid. */
function typeProblem(field: FieldDefinition, value: unknown): string | null {
  switch (field.interface) {
    case 'input':
    case 'textarea':
    case 'wysiwyg':
      return typeof value === 'string' ? null : 'must be text';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number';
    case 'toggle':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : 'must be a valid date';
    case 'dropdown':
      return typeof value === 'string' && (field.choices ?? []).some(c => c.value === value) ? null : 'must be one of the listed choices';
    case 'tags':
      return Array.isArray(value) && value.every(tag => typeof tag === 'string') ? null : 'must be a list of text tags';
    case 'image':
      // Rendered into <img src> by consumers, so only http(s) URLs are accepted.
      return typeof value === 'string' && isHttpUrl(value) ? null : 'must be an http(s) image URL';
    case 'code':
      return null;
  }
}

/**
 * Checks `data` against the collection's fields. Types are always enforced;
 * `required` only when publishing, so drafts can be saved while incomplete.
 * Keys without a definition are left alone for backwards compatibility.
 */
export function validateEntryData(schema: CollectionSchema, data: Record<string, unknown>, options: { published: boolean }): FieldError[] {
  const errors: FieldError[] = [];

  for (const field of schema.fields) {
    const value = data[field.key];

    if (isEmptyValue(field, value)) {
      if (field.required && options.published) errors.push({ field: field.key, message: `${fieldLabel(field)} is required to publish.` });
      continue;
    }

    const problem = typeProblem(field, value);
    if (problem) errors.push({ field: field.key, message: `${fieldLabel(field)} ${problem}.` });
  }

  return errors;
}
