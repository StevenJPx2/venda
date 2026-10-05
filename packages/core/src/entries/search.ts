import { storedSchema } from '../content-model';
import type { Database, Row } from '../runtime';
import { indexEntry } from './store';

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 64;
export const MAX_RESULTS = 50;
// Per call, so a large backlog is indexed across several requests instead of one slow one.
const BACKFILL_BATCH = 200;

/** Lower-cased search terms, capped in number and length. */
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).map(term => term.slice(0, MAX_TERM_LENGTH)).filter(Boolean))].slice(0, MAX_TERMS);
}

/** `%term%` with LIKE wildcards escaped, for use with `ESCAPE '\'`. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

/** Indexes entries that have no search row yet (content written before indexing existed). Returns how many. */
export async function backfillSearchIndex(db: Database): Promise<number> {
  const rows = await db.all<Row>(
    `SELECT e.*, c.schema_json FROM entries e JOIN collections c ON c.id = e.collection_id
     LEFT JOIN entry_search s ON s.entry_id = e.id WHERE s.entry_id IS NULL LIMIT ?`,
    BACKFILL_BATCH
  );
  for (const row of rows) await indexEntry(db, row, storedSchema(row.schema_json));
  return rows.length;
}

/**
 * Entry ids matching every term, best first: title matches rank above body
 * matches, then most recently updated. `variant` picks the working copy
 * (editors) or the published snapshot (public).
 */
export async function searchEntryIds(db: Database, options: { terms: string[]; variant: 'draft' | 'published'; collectionId?: string }): Promise<string[]> {
  if (!options.terms.length) return [];

  const title = `s.${options.variant}_title`;
  const body = `s.${options.variant}_text`;
  const conditions = options.terms.map(() => `(${title} LIKE ? ESCAPE '\\' OR ${body} LIKE ? ESCAPE '\\')`);
  const params: unknown[] = options.terms.flatMap(term => [likePattern(term), likePattern(term)]);

  if (options.collectionId) {
    conditions.push('s.collection_id = ?');
    params.push(options.collectionId);
  }

  if (options.variant === 'published') conditions.push("e.status = 'published'");

  const rows = await db.all<{ entry_id: string }>(
    `SELECT s.entry_id FROM entry_search s JOIN entries e ON e.id = s.entry_id
     WHERE e.deleted_at IS NULL AND ${conditions.join(' AND ')}
     ORDER BY (${title} LIKE ? ESCAPE '\\') DESC, e.updated_at DESC LIMIT ?`,
    ...params, likePattern(options.terms[0]!), MAX_RESULTS
  );
  return rows.map(row => row.entry_id);
}
