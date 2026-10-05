import { storedSchema } from '../content-model';
import type { RequestContext } from '../context';
import { backfillSearchIndex, searchEntryIds, searchTerms } from '../entries/search';
import { toEntry } from '../entries/store';
import { json } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';

/** Searches working copies across collections (or one, with `collection=<id>`). */
async function search(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const { db } = ctx.services.config;
  const terms = searchTerms(ctx.url.searchParams.get('q') ?? '');

  if (!terms.length) return json([]);

  await backfillSearchIndex(db);
  const collectionId = ctx.url.searchParams.get('collection') ?? undefined;
  const ids = await searchEntryIds(db, { terms, variant: 'draft', ...(collectionId ? { collectionId } : {}) });

  if (!ids.length) return json([]);

  const rows = await db.all<Row>(
    `SELECT e.*, c.schema_json FROM entries e JOIN collections c ON c.id = e.collection_id WHERE e.id IN (${ids.map(() => '?').join(', ')})`,
    ...ids
  );
  const byId = new Map(rows.map(row => [String(row.id), row]));
  return json(ids.flatMap(id => {
    const row = byId.get(id);
    return row ? [toEntry(row, storedSchema(row.schema_json))] : [];
  }));
}

export const searchRoutes = [route('GET', '/api/search', search)];
