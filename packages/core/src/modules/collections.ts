import { schemaInput, storedSchema } from '../content-model';
import type { RequestContext } from '../context';
import { HttpError, json, notFound, readJson } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import type { Collection } from '../types';
import { slugify } from '../validation';

export function toCollection(row: Row): Collection {
  return { id: String(row.id), name: String(row.name), slug: String(row.slug), schema: storedSchema(row.schema_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

async function listCollections(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  return json((await ctx.services.config.db.all('SELECT * FROM collections ORDER BY created_at DESC')).map(toCollection));
}

async function createCollection(ctx: RequestContext): Promise<Response> {
  await ctx.require('schema:manage');
  const body = await readJson(ctx.request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = slugify(typeof body.slug === 'string' ? body.slug : name);
  if (!name || !slug) throw new HttpError(400, 'Name is required');
  const parsed = schemaInput(body.schema);
  if ('error' in parsed) throw new HttpError(400, parsed.error);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await ctx.services.config.db.run('INSERT INTO collections (id, name, slug, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, slug, JSON.stringify(parsed.schema), now, now);
  } catch {
    throw new HttpError(409, 'Collection slug already exists');
  }

  return json({ id, name, slug, schema: parsed.schema, createdAt: now, updatedAt: now }, { status: 201 });
}

// Existing entries are untouched by model edits: removed fields become unvalidated keys.
async function updateCollection(ctx: RequestContext): Promise<Response> {
  await ctx.require('schema:manage');
  const { db, kv } = ctx.services.config;
  const id = ctx.params.id ?? '';
  const existing = await db.first('SELECT * FROM collections WHERE id = ?', id);
  if (!existing) throw notFound('Collection not found');
  const body = await readJson(ctx.request);
  const name = body.name === undefined ? String(existing.name) : String(body.name).trim();
  if (!name) throw new HttpError(400, 'Name is required');
  let schema = storedSchema(existing.schema_json);

  if (body.schema !== undefined) {
    const parsed = schemaInput(body.schema);
    if ('error' in parsed) throw new HttpError(400, parsed.error);
    schema = parsed.schema;
  }

  const now = new Date().toISOString();
  await db.run('UPDATE collections SET name = ?, schema_json = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(schema), now, id);
  await kv.delete(`content:${id}`);
  return json(toCollection({ ...existing, name, schema_json: JSON.stringify(schema), updated_at: now }));
}

export const collectionRoutes = [
  route('GET', '/api/collections', listCollections),
  route('POST', '/api/collections', createCollection),
  route('PATCH', '/api/collections/:id', updateCollection)
];
