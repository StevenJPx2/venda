import type { FieldError } from '@venda/schema';
import { allows, DELETE_CONTENT, EDIT, PUBLISH } from '../auth/permissions';
import { collectionSchema, entryErrors } from '../content-model';
import type { Actor, RequestContext } from '../context';
import { HttpError, json, notFound, readJson } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import type { Entry, Status } from '../types';
import { objectInput, slugify, statusInput } from '../validation';

export function toEntry(row: Row): Entry {
  return {
    id: String(row.id),
    collectionId: String(row.collection_id),
    slug: String(row.slug),
    data: JSON.parse(String(row.data_json)),
    status: row.status === 'published' ? 'published' : 'draft',
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rejectInvalid(errors: FieldError[]): void {
  if (errors.length) throw new HttpError(422, errors[0]?.message ?? 'Some fields are invalid', { fields: errors });
}

function requirePublish(actor: Actor, ownerId: string | null): void {
  if (!allows(actor.capabilities, PUBLISH, ownerId, actor.user.id)) throw new HttpError(403, 'You do not have permission to publish this entry');
}

async function loadEntry(ctx: RequestContext): Promise<Entry> {
  const row = await ctx.services.config.db.first('SELECT * FROM entries WHERE id = ?', ctx.params.id ?? '');
  if (!row) throw notFound('Entry not found');
  return toEntry(row);
}

async function listEntries(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  const { db } = ctx.services.config;
  const collectionId = ctx.params.id ?? '';
  if (!(await collectionSchema(db, collectionId))) throw notFound('Collection not found');
  return json((await db.all('SELECT * FROM entries WHERE collection_id = ? ORDER BY updated_at DESC', collectionId)).map(toEntry));
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
  const data = objectInput(body.data ?? {});
  const status = statusInput(body.status ?? 'draft');
  if (status === 'published') requirePublish(actor, actor.user.id);
  rejectInvalid(entryErrors(schema, data, status));

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO entries (id, collection_id, slug, data_json, status, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, collectionId, slug, JSON.stringify(data), status, actor.user.id, actor.user.id, now, now
    );
  } catch {
    throw new HttpError(409, 'Entry slug already exists in this collection');
  }
  await kv.delete(`content:${collectionId}`);
  return json(toEntry({ id, collection_id: collectionId, slug, data_json: JSON.stringify(data), status, created_by: actor.user.id, updated_by: actor.user.id, created_at: now, updated_at: now }), { status: 201 });
}

async function getEntry(ctx: RequestContext): Promise<Response> {
  await ctx.require('content:read');
  return json(await loadEntry(ctx));
}

async function updateEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const existing = await loadEntry(ctx);
  if (!allows(actor.capabilities, EDIT, existing.createdBy, actor.user.id)) throw new HttpError(403, 'You do not have permission to edit this entry');
  const body = await readJson(ctx.request);
  const status: Status = body.status === undefined ? existing.status : statusInput(body.status);
  // Changing status, or editing live content, is a publishing action.
  if (status !== existing.status || existing.status === 'published') requirePublish(actor, existing.createdBy);

  const slug = body.slug === undefined ? existing.slug : slugify(String(body.slug));
  if (!slug) throw new HttpError(400, 'Entry slug is required');
  const data = body.data === undefined ? existing.data : objectInput(body.data);
  const { db, kv } = ctx.services.config;
  const schema = await collectionSchema(db, existing.collectionId);
  if (schema) rejectInvalid(entryErrors(schema, data, status));

  const now = new Date().toISOString();
  try {
    await db.run('UPDATE entries SET slug = ?, data_json = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?', slug, JSON.stringify(data), status, actor.user.id, now, existing.id);
  } catch {
    throw new HttpError(409, 'Entry slug already exists in this collection');
  }
  await kv.delete(`content:${existing.collectionId}`);
  return json({ ...existing, slug, data, status, updatedBy: actor.user.id, updatedAt: now });
}

async function deleteEntry(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const existing = await loadEntry(ctx);
  if (!allows(actor.capabilities, DELETE_CONTENT, existing.createdBy, actor.user.id)) throw new HttpError(403, 'You do not have permission to delete this entry');
  if (existing.status === 'published') requirePublish(actor, existing.createdBy);
  const { db, kv } = ctx.services.config;
  await db.run('DELETE FROM entries WHERE id = ?', existing.id);
  await kv.delete(`content:${existing.collectionId}`);
  return json({ ok: true });
}

export const entryRoutes = [
  route('GET', '/api/collections/:id/entries', listEntries),
  route('POST', '/api/collections/:id/entries', createEntry),
  route('GET', '/api/entries/:id', getEntry),
  route('PATCH', '/api/entries/:id', updateEntry),
  route('DELETE', '/api/entries/:id', deleteEntry)
];
