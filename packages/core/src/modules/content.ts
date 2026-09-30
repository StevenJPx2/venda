import type { RequestContext } from '../context';
import { json, notFound } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import type { PublicEntry } from '../types';
import { toEntry } from './entries';

function toPublicEntry(row: Row): PublicEntry {
  const entry = toEntry(row);
  return { id: entry.id, collectionId: entry.collectionId, slug: entry.slug, data: entry.data, status: entry.status, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
}

const PUBLIC_CACHE = { headers: { 'Cache-Control': 'public, max-age=60' } };

async function collectionIdFor(ctx: RequestContext): Promise<string> {
  const row = await ctx.services.config.db.first<{ id: string }>('SELECT id FROM collections WHERE slug = ?', ctx.params.collection ?? '');
  if (!row) throw notFound('Collection not found');
  return row.id;
}

async function listPublished(ctx: RequestContext): Promise<Response> {
  const collectionId = await collectionIdFor(ctx);
  const rows = await ctx.services.config.db.all("SELECT * FROM entries WHERE collection_id = ? AND status = 'published' ORDER BY updated_at DESC", collectionId);
  return json(rows.map(toPublicEntry), PUBLIC_CACHE);
}

async function getPublished(ctx: RequestContext): Promise<Response> {
  const collectionId = await collectionIdFor(ctx);
  const row = await ctx.services.config.db.first("SELECT * FROM entries WHERE collection_id = ? AND slug = ? AND status = 'published'", collectionId, ctx.params.slug ?? '');
  if (!row) throw notFound('Entry not found');
  return json(toPublicEntry(row), PUBLIC_CACHE);
}

export const contentRoutes = [
  route('GET', '/api/content/:collection', listPublished),
  route('GET', '/api/content/:collection/:slug', getPublished)
];
