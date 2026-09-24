import { SchemaError, parseSchema, validateEntryData, type CollectionSchema, type FieldError } from '@venda/schema';
import type { Env, Status } from './types';

const EMPTY_SCHEMA: CollectionSchema = { version: 1, fields: [] };

/** Schema as stored in D1. A corrupt value degrades to "no fields" rather than breaking reads. */
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

export async function collectionSchema(env: Env, collectionId: string): Promise<CollectionSchema | null> {
  const row = await env.VENDA_DB.prepare('SELECT schema_json FROM collections WHERE id = ?').bind(collectionId).first<{ schema_json: string }>();
  return row ? storedSchema(row.schema_json) : null;
}

export function entryErrors(schema: CollectionSchema, data: Record<string, unknown>, status: Status): FieldError[] {
  return validateEntryData(schema, data, { published: status === 'published' });
}
