import { EDIT } from '../auth/permissions';
import { collectionSchema } from '../content-model';
import type { RequestContext } from '../context';
import { indexEntry, invalidateCollection, loadEntryRow, recordRevision, toEntry, toRevision } from '../entries/store';
import { HttpError, json, notFound } from '../http';
import { route } from '../router';
import { requireScoped } from './entries';

async function listRevisions(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const { db } = ctx.services.config;
  const entry = await loadEntryRow(db, ctx.params.id ?? '');
  const schema = await collectionSchema(db, String(entry.collection_id));
  const rows = await db.all('SELECT * FROM entry_revisions WHERE entry_id = ? ORDER BY created_at DESC', String(entry.id));
  return json(rows.map(row => toRevision(row, schema)));
}

async function getRevision(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const { db } = ctx.services.config;
  const row = await db.first('SELECT r.*, e.collection_id FROM entry_revisions r JOIN entries e ON e.id = r.entry_id WHERE r.id = ?', ctx.params.id ?? '');

  if (!row) throw notFound('Revision not found');

  return json(toRevision(row, await collectionSchema(db, String(row.collection_id))));
}

/** Copies a revision into the working copy; publishing it is a separate step. */
async function restoreRevision(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const { db, kv } = ctx.services.config;
  const revision = await db.first('SELECT * FROM entry_revisions WHERE id = ?', ctx.params.id ?? '');

  if (!revision) throw notFound('Revision not found');

  const entry = await loadEntryRow(db, String(revision.entry_id));
  requireScoped(actor, EDIT, entry.created_by ? String(entry.created_by) : null, 'You do not have permission to edit this entry');

  if (entry.deleted_at) throw new HttpError(409, 'Restore this entry from the trash first');

  // The revision's slug may now belong to another entry; keep the current one.
  await db.run('UPDATE entries SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = ?', String(revision.data_json), actor.user.id, new Date().toISOString(), String(entry.id));
  const updated = await loadEntryRow(db, String(entry.id));
  await recordRevision(db, updated, 'restore', actor.user.id);
  const schema = await collectionSchema(db, String(entry.collection_id));

  if (schema) await indexEntry(db, updated, schema);

  await invalidateCollection(kv, String(entry.collection_id));
  return json(toEntry(updated, schema));
}

export const revisionRoutes = [
  route('GET', '/api/entries/:id/revisions', listRevisions),
  route('GET', '/api/revisions/:id', getRevision),
  route('POST', '/api/revisions/:id/restore', restoreRevision)
];
