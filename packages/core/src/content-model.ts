import { SchemaError, parseSchema, validateEntryData, type CollectionSchema, type FieldError } from '@venda/schema';
import { toDoc, trimTrailingEmpty } from '@venda/richtext';
import type { Database } from './runtime';
import type { Status } from './types';

const EMPTY_SCHEMA: CollectionSchema = { version: 1, fields: [] };

/** Schema as stored in the database. A corrupt value degrades to "no fields" rather than breaking reads. */
export function storedSchema(raw: unknown): CollectionSchema {
  try {
    return parseSchema(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return EMPTY_SCHEMA;
  }
}

/** Schema submitted by an admin: returns the parsed schema or the reason it was rejected. */
export function schemaInput(raw: unknown): { schema: CollectionSchema } | { error: string } {
  try {
    return { schema: parseSchema(raw) };
  } catch (error) {
    if (error instanceof SchemaError) return { error: error.message };

    throw error;
  }
}

export async function collectionSchema(db: Database, collectionId: string): Promise<CollectionSchema | null> {
  const row = await db.first<{ schema_json: string }>('SELECT schema_json FROM collections WHERE id = ?', collectionId);
  return row ? storedSchema(row.schema_json) : null;
}

export function entryErrors(schema: CollectionSchema, data: Record<string, unknown>, status: Status): FieldError[] {
  return validateEntryData(schema, data, { published: status === 'published' });
}

/**
 * Rich-text fields as documents: HTML strings (from older clients or content
 * stored before documents) are converted, and editor trailing empty paragraphs
 * are dropped. Other values pass through unchanged.
 */
export function normalizeEntryData(schema: CollectionSchema, data: Record<string, unknown>): Record<string, unknown> {
  const richText = schema.fields.filter(field => field.interface === 'wysiwyg' && data[field.key] !== undefined && data[field.key] !== null);

  if (!richText.length) return data;

  const normalized = { ...data };

  for (const field of richText) {
    const value = data[field.key];

    if (typeof value === 'string' || (typeof value === 'object' && value !== null)) normalized[field.key] = trimTrailingEmpty(toDoc(value));
  }

  return normalized;
}
