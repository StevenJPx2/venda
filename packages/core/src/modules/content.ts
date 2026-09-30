import type { CollectionSchema } from '@venda/schema';
import { normalizeEntryData, storedSchema } from '../content-model';
import type { RequestContext } from '../context';
import { json, notFound } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import type { PublicEntry } from '../types';
import { toEntry } from './entries';

function toPublicEntry(row: Row, schema: CollectionSchema): PublicEntry {
  const entry = toEntry(row);
  return { id: entry.id, collectionId: entry.collectionId, slug: entry.slug, data: normalizeEntryData(schema, entry.data), status: entry.status, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
}

const PUBLIC_CACHE = { headers: { 'Cache-Control': 'public, max-age=60' } };

async function collectionFor(ctx: RequestContext): Promise<{ id: string; schema: CollectionSchema }> {
  const row = await ctx.services.config.db.first<{ id: string; schema_json: string }>('SELECT id, schema_json FROM collections WHERE slug = ?', ctx.params.collection ?? '');
  if (!row) throw notFound('Collection not found');
  return { id: row.id, schema: storedSchema(row.schema_json) };
}

async function listPublished(ctx: RequestContext): Promise<Response> {
  const collection = await collectionFor(ctx);
  const rows = await ctx.services.config.db.all("SELECT * FROM entries WHERE collection_id = ? AND status = 'published' ORDER BY updated_at DESC", collection.id);
  return json(rows.map(row => toPublicEntry(row, collection.schema)), PUBLIC_CACHE);
}

async function getPublished(ctx: RequestContext): Promise<Response> {
  const collection = await collectionFor(ctx);
  const row = await ctx.services.config.db.first("SELECT * FROM entries WHERE collection_id = ? AND slug = ? AND status = 'published'", collection.id, ctx.params.slug ?? '');
  if (!row) throw notFound('Entry not found');
  return json(toPublicEntry(row, collection.schema), PUBLIC_CACHE);
}

export const contentRoutes = [
  route('GET', '/api/content/:collection', listPublished),
  route('GET', '/api/content/:collection/:slug', getPublished)
];
