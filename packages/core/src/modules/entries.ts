import type { FieldError } from '@venda/schema';
import { allows, DELETE_CONTENT, EDIT, PUBLISH, type ScopedAction } from '../auth/permissions';
import { collectionSchema, entryErrors, normalizeEntryData } from '../content-model';
import type { Actor, RequestContext } from '../context';
import { indexEntry, invalidateCollection, loadEntryRow, publishEntry, recordRevision, toEntry, unpublishEntry } from '../entries/store';
import { HttpError, json, notFound, readJson } from '../http';
import { route } from '../router';
import type { Database, Row } from '../runtime';
import { objectInput, slugify, statusInput } from '../validation';

const MAX_SLUG_ATTEMPTS = 50;

function rejectInvalid(errors: FieldError[]): void {
  if (errors.length) throw new HttpError(422, errors[0]?.message ?? 'Some fields are invalid', { fields: errors });
}

export function requireScoped(actor: Actor, action: ScopedAction, ownerId: string | null, message: string): void {
  if (!allows(actor.capabilities, action, ownerId, actor.user.id)) throw new HttpError(403, message);
}

const owner = (row: Row): string | null => (row.created_by ? String(row.created_by) : null);

function isSlugConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE|constraint/i.test(error.message);
}

async function listEntries(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const { db } = ctx.services.config;
  const collectionId = ctx.params.id ?? '';
  const schema = await collectionSchema(db, collectionId);

  if (!schema) throw notFound('Collection not found');

  const trash = ctx.url.searchParams.get('trash') === '1';
  const rows = await db.all(
    `SELECT * FROM entries WHERE collection_id = ? AND deleted_at IS ${trash ? 'NOT NULL ORDER BY deleted_at DESC' : 'NULL ORDER BY updated_at DESC'}`,
    collectionId
  );
  return json(rows.map(row => toEntry(row, schema)));
}

async function createEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require('content:create');
  const { db, kv } = ctx.services.config;
  const collectionId = ctx.params.id ?? '';
  const schema = await collectionSchema(db, collectionId);

  if (!schema) throw notFound('Collection not found');

  const body = await readJson(ctx.request);
  const slug = slugify(typeof body.slug === 'string' ? body.slug : '');

  if (!slug) throw new HttpError(400, 'Entry slug is required');

  const input = objectInput(body.data ?? {});
  const publish = statusInput(body.status ?? 'draft') === 'published';

  if (publish) requireScoped(actor, PUBLISH, actor.user.id, 'You do not have permission to publish this entry');

  rejectInvalid(entryErrors(schema, input, publish ? 'published' : 'draft'));

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await db.run(
      'INSERT INTO entries (id, collection_id, slug, data_json, status, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, collectionId, slug, JSON.stringify(normalizeEntryData(schema, input)), 'draft', actor.user.id, actor.user.id, now, now
    );
  } catch (error) {
    if (isSlugConflict(error)) throw new HttpError(409, 'Entry slug already exists in this collection');

    throw error;
  }

  let row = await loadEntryRow(db, id);
  await indexEntry(db, row, schema);

  if (publish) row = await publishEntry(db, row, actor.user.id);

  await invalidateCollection(kv, collectionId);
  return json(toEntry(row, schema), { status: 201 });
}

async function getEntry(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const row = await loadEntryRow(ctx.services.config.db, ctx.params.id ?? '');
  return json(toEntry(row, await collectionSchema(ctx.services.config.db, String(row.collection_id))));
}

/** Saves the working copy. Published content is unaffected until the entry is published again. */
async function saveEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const { db } = ctx.services.config;
  const existing = await loadEntryRow(db, ctx.params.id ?? '');
  requireScoped(actor, EDIT, owner(existing), 'You do not have permission to edit this entry');

  if (existing.deleted_at) throw new HttpError(409, 'Restore this entry from the trash before editing it');

  const body = await readJson(ctx.request);

  if (body.status !== undefined) throw new HttpError(400, 'Use the publish and unpublish endpoints to change status');

  const slug = body.slug === undefined ? String(existing.slug) : slugify(String(body.slug));

  if (!slug) throw new HttpError(400, 'Entry slug is required');

  const schema = await collectionSchema(db, String(existing.collection_id));

  if (!schema) throw notFound('Collection not found');

  const input = body.data === undefined ? JSON.parse(String(existing.data_json)) as Record<string, unknown> : objectInput(body.data);
  rejectInvalid(entryErrors(schema, input, 'draft'));

  try {
    await db.run('UPDATE entries SET slug = ?, data_json = ?, updated_by = ?, updated_at = ? WHERE id = ?', slug, JSON.stringify(normalizeEntryData(schema, input)), actor.user.id, new Date().toISOString(), String(existing.id));
  } catch (error) {
    if (isSlugConflict(error)) throw new HttpError(409, 'Entry slug already exists in this collection');

    throw error;
  }

  const row = await loadEntryRow(db, String(existing.id));
  await recordRevision(db, row, 'save', actor.user.id);
  await indexEntry(db, row, schema);
  await invalidateCollection(ctx.services.config.kv, String(row.collection_id));
  return json(toEntry(row, schema));
}

async function moveToTrash(ctx: RequestContext, actor: Actor, row: Row): Promise<void> {
  const { db } = ctx.services.config;

  // Trashing unpublishes, so it needs publish rights when the entry is live.
  if (row.status === 'published') {
    requireScoped(actor, PUBLISH, owner(row), 'You do not have permission to unpublish this entry');
    row = await unpublishEntry(db, row, actor.user.id);
  }

  const now = new Date().toISOString();
  await db.run('UPDATE entries SET deleted_at = ?, publish_at = NULL, unpublish_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?', now, actor.user.id, now, String(row.id));
}

async function deleteEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const { db, kv } = ctx.services.config;
  const row = await loadEntryRow(db, ctx.params.id ?? '');
  requireScoped(actor, DELETE_CONTENT, owner(row), 'You do not have permission to delete this entry');

  if (ctx.url.searchParams.get('permanent') === 'true') {
    if (!row.deleted_at) throw new HttpError(409, 'Move the entry to the trash before deleting it permanently');

    await db.run('DELETE FROM entries WHERE id = ?', String(row.id));
  } else if (!row.deleted_at) {
    await moveToTrash(ctx, actor, row);
  }

  await invalidateCollection(kv, String(row.collection_id));
  return json({ ok: true });
}

/** The entry's slug, or the first free `slug-N`, among entries outside the trash. */
async function freeSlug(db: Database, collectionId: string, slug: string, entryId: string): Promise<string> {
  const base = slug.replace(/-\d+$/, '');

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? slug : `${base}-${attempt + 1}`;
    const taken = await db.first('SELECT id FROM entries WHERE collection_id = ? AND slug = ? AND deleted_at IS NULL AND id != ?', collectionId, candidate, entryId);

    if (!taken) return candidate;
  }

  throw new HttpError(409, 'Could not find a free URL slug for this entry');
}

/** Takes an entry out of the trash as a draft, renaming it if its slug was reused meanwhile. */
async function restoreEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const { db, kv } = ctx.services.config;
  const row = await loadEntryRow(db, ctx.params.id ?? '');
  requireScoped(actor, DELETE_CONTENT, owner(row), 'You do not have permission to restore this entry');

  if (!row.deleted_at) throw new HttpError(409, 'This entry is not in the trash');

  const slug = await freeSlug(db, String(row.collection_id), String(row.slug), String(row.id));
  await db.run('UPDATE entries SET deleted_at = NULL, slug = ?, updated_by = ?, updated_at = ? WHERE id = ?', slug, actor.user.id, new Date().toISOString(), String(row.id));
  await invalidateCollection(kv, String(row.collection_id));
  const restored = await loadEntryRow(db, String(row.id));
  return json(toEntry(restored, await collectionSchema(db, String(row.collection_id))));
}

export const entryRoutes = [
  route('GET', '/api/collections/:id/entries', listEntries),
  route('POST', '/api/collections/:id/entries', createEntry),
  route('GET', '/api/entries/:id', getEntry),
  route('PATCH', '/api/entries/:id', saveEntry),
  route('DELETE', '/api/entries/:id', deleteEntry),
  route('POST', '/api/entries/:id/restore', restoreEntry)
];
