import type { CollectionSchema } from '@venda/schema';
import { storedSchema } from '../content-model';
import type { RequestContext } from '../context';
import { searchEntryIds, searchTerms } from '../entries/search';
import { toPublicEntry } from '../entries/store';
import { json, notFound } from '../http';
import { route } from '../router';

const PUBLIC_CACHE = { headers: { 'Cache-Control': 'public, max-age=60' } };

async function collectionFor(ctx: RequestContext): Promise<{ id: string; schema: CollectionSchema }> {
  const row = await ctx.services.config.db.first<{ id: string; schema_json: string }>('SELECT id, schema_json FROM collections WHERE slug = ?', ctx.params.collection ?? '');

  if (!row) throw notFound('Collection not found');

  return { id: row.id, schema: storedSchema(row.schema_json) };
}

/** Published entries, newest first; `?q=` searches their published text. */
async function listPublished(ctx: RequestContext): Promise<Response> {
  const collection = await collectionFor(ctx);
  const { db } = ctx.services.config;
  const terms = searchTerms(ctx.url.searchParams.get('q') ?? '');

  if (terms.length) {
    const ids = await searchEntryIds(db, { terms, variant: 'published', collectionId: collection.id });

    if (!ids.length) return json([], PUBLIC_CACHE);

    const rows = await db.all(`SELECT * FROM entries WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids);
    const byId = new Map(rows.map(row => [String(row.id), row]));
    return json(ids.flatMap(id => (byId.has(id) ? [toPublicEntry(byId.get(id)!, collection.schema)] : [])), PUBLIC_CACHE);
  }

  const rows = await db.all("SELECT * FROM entries WHERE collection_id = ? AND status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, updated_at DESC", collection.id);
  return json(rows.map(row => toPublicEntry(row, collection.schema)), PUBLIC_CACHE);
}

async function getPublished(ctx: RequestContext): Promise<Response> {
  const collection = await collectionFor(ctx);
  const row = await ctx.services.config.db.first("SELECT * FROM entries WHERE collection_id = ? AND slug = ? AND status = 'published' AND deleted_at IS NULL", collection.id, ctx.params.slug ?? '');

  if (!row) throw notFound('Entry not found');

  return json(toPublicEntry(row, collection.schema), PUBLIC_CACHE);
}

export const contentRoutes = [
  route('GET', '/api/content/:collection', listPublished),
  route('GET', '/api/content/:collection/:slug', getPublished)
];
