import { hmac, secretsMatch } from '../auth/crypto';
import { EDIT, PUBLISH } from '../auth/permissions';
import { collectionSchema, entryErrors, normalizeEntryData } from '../content-model';
import type { RequestContext } from '../context';
import { invalidateCollection, loadEntryRow, publishEntry, toEntry, unpublishEntry } from '../entries/store';
import { HttpError, json, notFound, readJson } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import { requireScoped } from './entries';

const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Scheduling far into the future is almost certainly a mistake (e.g. a wrong year).
const MAX_SCHEDULE_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const owner = (row: Row): string | null => (row.created_by ? String(row.created_by) : null);

async function liveRow(ctx: RequestContext): Promise<Row> {
  const row = await loadEntryRow(ctx.services.config.db, ctx.params.id ?? '');
  if (row.deleted_at) throw new HttpError(409, 'This entry is in the trash');
  return row;
}

async function respond(ctx: RequestContext, row: Row): Promise<Response> {
  await invalidateCollection(ctx.services.config.kv, String(row.collection_id));
  return json(toEntry(row, await collectionSchema(ctx.services.config.db, String(row.collection_id))));
}

async function publish(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const row = await liveRow(ctx);
  requireScoped(actor, PUBLISH, owner(row), 'You do not have permission to publish this entry');
  return respond(ctx, await publishEntry(ctx.services.config.db, row, actor.user.id));
}

async function unpublish(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const row = await liveRow(ctx);
  requireScoped(actor, PUBLISH, owner(row), 'You do not have permission to unpublish this entry');
  return respond(ctx, await unpublishEntry(ctx.services.config.db, row, actor.user.id));
}

/** A future ISO timestamp, null to clear, or undefined to leave unchanged. */
function scheduleTime(value: unknown, name: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(time)) throw new HttpError(400, `${name} must be an ISO 8601 date`);
  if (time <= Date.now()) throw new HttpError(400, `${name} must be in the future`);
  if (time - Date.now() > MAX_SCHEDULE_AHEAD_MS) throw new HttpError(400, `${name} is too far in the future`);
  return new Date(time).toISOString();
}

/** Sets or clears when the entry publishes and unpublishes itself. */
async function schedule(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const { db } = ctx.services.config;
  const row = await liveRow(ctx);
  requireScoped(actor, PUBLISH, owner(row), 'You do not have permission to schedule this entry');
  const body = await readJson(ctx.request);
  const publishAt = scheduleTime(body.publishAt, 'publishAt');
  const unpublishAt = scheduleTime(body.unpublishAt, 'unpublishAt');
  const nextPublish = publishAt === undefined ? (row.publish_at ? String(row.publish_at) : null) : publishAt;
  const nextUnpublish = unpublishAt === undefined ? (row.unpublish_at ? String(row.unpublish_at) : null) : unpublishAt;
  if (nextPublish && nextUnpublish && nextUnpublish <= nextPublish) throw new HttpError(400, 'unpublishAt must be after publishAt');

  if (publishAt) {
    // Catch missing required fields now rather than at publish time.
    const schema = await collectionSchema(db, String(row.collection_id));
    const errors = schema ? entryErrors(schema, JSON.parse(String(row.data_json)) as Record<string, unknown>, 'published') : [];
    if (errors.length) throw new HttpError(422, errors[0]?.message ?? 'Some fields are invalid', { fields: errors });
  }

  await db.run('UPDATE entries SET publish_at = ?, unpublish_at = ?, schedule_error = NULL, updated_by = ?, updated_at = ? WHERE id = ?', nextPublish, nextUnpublish, actor.user.id, new Date().toISOString(), String(row.id));
  return respond(ctx, await loadEntryRow(db, String(row.id)));
}

async function previewSignature(entryId: string, expires: number, secret: string): Promise<string> {
  return hmac(`preview:${entryId}:${expires}`, secret);
}

async function createPreview(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const row = await liveRow(ctx);
  requireScoped(actor, EDIT, owner(row), 'You do not have permission to preview this entry');
  const expires = Date.now() + PREVIEW_TTL_MS;
  const token = `${String(row.id)}.${expires}.${await previewSignature(String(row.id), expires, ctx.services.config.sessionSecret)}`;
  return json({ token, expiresAt: new Date(expires).toISOString() }, { status: 201 });
}

/** Public: the working copy of the entry a valid preview token names. */
async function viewPreview(ctx: RequestContext): Promise<Response> {
  const [entryId = '', expiresRaw = '', signature = ''] = (ctx.params.token ?? '').split('.');
  const expires = Number(expiresRaw);
  const expected = await previewSignature(entryId, expires, ctx.services.config.sessionSecret);
  if (!Number.isFinite(expires) || expires < Date.now() || !(await secretsMatch(signature, expected))) throw notFound('This preview link is invalid or has expired');
  const { db } = ctx.services.config;
  const row = await db.first('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL', entryId);
  if (!row) throw notFound('This preview link is invalid or has expired');
  const schema = await collectionSchema(db, String(row.collection_id));
  const data = JSON.parse(String(row.data_json)) as Record<string, unknown>;
  return json({
    id: String(row.id),
    collectionId: String(row.collection_id),
    slug: String(row.slug),
    data: schema ? normalizeEntryData(schema, data) : data,
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }, { headers: { 'X-Robots-Tag': 'noindex' } });
}

export const lifecycleRoutes = [
  route('POST', '/api/entries/:id/publish', publish),
  route('POST', '/api/entries/:id/unpublish', unpublish),
  route('PUT', '/api/entries/:id/schedule', schedule),
  route('POST', '/api/entries/:id/preview', createPreview),
  route('GET', '/api/preview/:token', viewPreview)
];
