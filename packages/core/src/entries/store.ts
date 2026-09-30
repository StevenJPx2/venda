import { toDoc, toPlainText } from '@venda/richtext';
import type { CollectionSchema } from '@venda/schema';
import { collectionSchema, entryErrors, normalizeEntryData } from '../content-model';
import { HttpError, notFound } from '../http';
import type { Database, KeyValue, Row } from '../runtime';
import type { Entry, PublicEntry, Revision, RevisionReason } from '../types';

// A save revision is recorded at most this often per entry; publishes and restores always are.
const SAVE_REVISION_INTERVAL_MS = 10 * 60 * 1000;
export const MAX_REVISIONS_PER_ENTRY = 50;

function parseData(raw: unknown): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(String(raw));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export function toEntry(row: Row, schema: CollectionSchema | null): Entry {
  const data = parseData(row.data_json);
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    slug: String(row.slug),
    data: schema ? normalizeEntryData(schema, data) : data,
    status: row.status === 'published' ? 'published' : 'draft',
    hasUnpublishedChanges: row.status === 'published' && row.published_json !== row.data_json,
    publishedAt: text(row.published_at),
    publishAt: text(row.publish_at),
    unpublishAt: text(row.unpublish_at),
    scheduleError: text(row.schedule_error),
    deletedAt: text(row.deleted_at),
    createdBy: text(row.created_by),
    updatedBy: text(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function toPublicEntry(row: Row, schema: CollectionSchema): PublicEntry {
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    slug: String(row.slug),
    data: normalizeEntryData(schema, parseData(row.published_json)),
    status: 'published',
    publishedAt: text(row.published_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function toRevision(row: Row, schema: CollectionSchema | null): Revision {
  const data = parseData(row.data_json);
  const reason = row.reason === 'publish' || row.reason === 'restore' ? row.reason : 'save';
  return { id: String(row.id), entryId: String(row.entry_id), slug: String(row.slug), data: schema ? normalizeEntryData(schema, data) : data, reason, createdBy: text(row.created_by), createdAt: String(row.created_at) };
}

export async function loadEntryRow(db: Database, id: string): Promise<Row> {
  const row = await db.first('SELECT * FROM entries WHERE id = ?', id);
  if (!row) throw notFound('Entry not found');
  return row;
}

/** Lower-cased searchable text: the title first, then every text-bearing field. */
export function searchText(schema: CollectionSchema, data: Record<string, unknown>): { title: string; body: string } {
  const title = schema.titleField && typeof data[schema.titleField] === 'string' ? String(data[schema.titleField]) : '';
  const parts: string[] = [];
  for (const field of schema.fields) {
    const value = data[field.key];
    if (field.key === schema.titleField || value === undefined || value === null) continue;
    if (field.interface === 'wysiwyg') parts.push(toPlainText(toDoc(value)));
    else if (typeof value === 'string' && ['input', 'textarea', 'dropdown'].includes(field.interface)) parts.push(value);
    else if (field.interface === 'tags' && Array.isArray(value)) parts.push(value.filter(tag => typeof tag === 'string').join(' '));
  }
  return { title: title.toLowerCase(), body: parts.join(' ').replace(/\s+/g, ' ').toLowerCase() };
}

/** Rewrites the entry's search row from its current working copy and published snapshot. */
export async function indexEntry(db: Database, row: Row, schema: CollectionSchema): Promise<void> {
  const draft = searchText(schema, parseData(row.data_json));
  const published = row.published_json ? searchText(schema, parseData(row.published_json)) : { title: '', body: '' };
  await db.run(
    `INSERT INTO entry_search (entry_id, collection_id, draft_title, draft_text, published_title, published_text) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id) DO UPDATE SET collection_id = excluded.collection_id, draft_title = excluded.draft_title, draft_text = excluded.draft_text,
       published_title = excluded.published_title, published_text = excluded.published_text`,
    String(row.id), String(row.collection_id), draft.title, draft.body, published.title, published.body
  );
}

/** Records a revision of the entry's working copy, then trims to the newest MAX_REVISIONS_PER_ENTRY. */
export async function recordRevision(db: Database, row: Row, reason: RevisionReason, userId: string | null): Promise<void> {
  const entryId = String(row.id);
  if (reason === 'save') {
    const latest = await db.first<{ created_at: string; data_json: string }>('SELECT created_at, data_json FROM entry_revisions WHERE entry_id = ? ORDER BY created_at DESC LIMIT 1', entryId);
    if (latest && (latest.data_json === row.data_json || Date.now() - Date.parse(latest.created_at) < SAVE_REVISION_INTERVAL_MS)) return;
  }
  await db.run('INSERT INTO entry_revisions (id, entry_id, slug, data_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), entryId, String(row.slug), String(row.data_json), reason, userId, new Date().toISOString());
  await db.run(
    'DELETE FROM entry_revisions WHERE entry_id = ? AND id NOT IN (SELECT id FROM entry_revisions WHERE entry_id = ? ORDER BY created_at DESC LIMIT ?)',
    entryId, entryId, MAX_REVISIONS_PER_ENTRY
  );
}

export async function invalidateCollection(kv: KeyValue, collectionId: string): Promise<void> {
  await kv.delete(`content:${collectionId}`);
}

/**
 * Publishes the working copy. Required fields are enforced here: a draft may
 * be incomplete, published content may not. Returns the updated row.
 */
export async function publishEntry(db: Database, row: Row, userId: string | null): Promise<Row> {
  const schema = await collectionSchema(db, String(row.collection_id));
  if (!schema) throw notFound('Collection not found');
  if (row.deleted_at) throw new HttpError(409, 'Restore this entry from the trash before publishing it');
  const errors = entryErrors(schema, parseData(row.data_json), 'published');
  if (errors.length) throw new HttpError(422, errors[0]?.message ?? 'Some fields are invalid', { fields: errors });
  const now = new Date().toISOString();
  await db.run(
    "UPDATE entries SET published_json = data_json, status = 'published', published_at = COALESCE(published_at, ?), publish_at = NULL, schedule_error = NULL, updated_by = COALESCE(?, updated_by), updated_at = ? WHERE id = ?",
    now, userId, now, String(row.id)
  );
  const updated = await loadEntryRow(db, String(row.id));
  await recordRevision(db, updated, 'publish', userId);
  await indexEntry(db, updated, schema);
  return updated;
}

export async function unpublishEntry(db: Database, row: Row, userId: string | null): Promise<Row> {
  const now = new Date().toISOString();
  await db.run(
    "UPDATE entries SET published_json = NULL, status = 'draft', unpublish_at = NULL, updated_by = COALESCE(?, updated_by), updated_at = ? WHERE id = ?",
    userId, now, String(row.id)
  );
  const updated = await loadEntryRow(db, String(row.id));
  const schema = await collectionSchema(db, String(row.collection_id));
  if (schema) await indexEntry(db, updated, schema);
  return updated;
}
