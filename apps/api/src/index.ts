import { createSession, destroySession, expiredCookie, secretsMatch, sessionCookie, sessionEmail } from './auth';
import { collectionSchema, entryErrors, schemaInput, storedSchema } from './content-model';
import { allowedAdminOrigins, corsHeaders } from './cors';
import { objectInput, slugify, statusInput } from './validation';
import type { Collection, Entry, Env, Status } from './types';
import type { FieldError } from '@venda/schema';

const json = (body: unknown, init: ResponseInit = {}): Response => Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });
const id = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

function collection(row: Record<string, unknown>): Collection { return { id: String(row.id), name: String(row.name), slug: String(row.slug), schema: storedSchema(row.schema_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function invalidFields(fields: FieldError[]): Response { return json({ error: fields[0]?.message ?? 'Some fields are invalid', fields }, { status: 422 }); }
function entry(row: Record<string, unknown>): Entry { return { id: String(row.id), collectionId: String(row.collection_id), slug: String(row.slug), data: JSON.parse(String(row.data_json)), status: row.status as Status, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function cookieResponse(response: Response, cookie: string): Response { const headers = new Headers(response.headers); headers.append('Set-Cookie', cookie); return new Response(response.body, { status: response.status, headers }); }

async function readBody(request: Request): Promise<Record<string, unknown>> { return objectInput(await request.json()); }

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  if (await sessionEmail(request, env)) return null;
  return json({ error: 'Authentication required' }, { status: 401 });
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const [emailOk, passwordOk] = await Promise.all([
    secretsMatch(String(body.email ?? '').trim().toLowerCase(), env.ADMIN_EMAIL.trim().toLowerCase()),
    secretsMatch(String(body.password ?? ''), env.ADMIN_PASSWORD)
  ]);
  if (!emailOk || !passwordOk) return json({ error: 'Invalid credentials' }, { status: 401 });
  return cookieResponse(json({ email: env.ADMIN_EMAIL }), sessionCookie(await createSession(env.ADMIN_EMAIL, env)));
}

async function collections(request: Request, env: Env): Promise<Response> {
  const rows = await env.VENDA_DB.prepare('SELECT * FROM collections ORDER BY created_at DESC').all();
  if (request.method === 'GET') return json(rows.results.map(collection));
  const body = await readBody(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = slugify(typeof body.slug === 'string' ? body.slug : name);
  if (!name || !slug) return json({ error: 'Name is required' }, { status: 400 });
  const parsed = schemaInput(body.schema);
  if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
  const { schema } = parsed;
  const timestamp = now();
  const collectionId = id();
  try {
    await env.VENDA_DB.prepare('INSERT INTO collections (id, name, slug, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(collectionId, name, slug, JSON.stringify(schema), timestamp, timestamp).run();
  } catch { return json({ error: 'Collection slug already exists' }, { status: 409 }); }
  return json({ id: collectionId, name, slug, schema, createdAt: timestamp, updatedAt: timestamp }, { status: 201 });
}

// Edits the data model. Existing entries are untouched: removed fields simply
// become unvalidated keys, as with Directus alias-free schema changes.
async function updateCollection(request: Request, env: Env, collectionId: string): Promise<Response> {
  const existing = await env.VENDA_DB.prepare('SELECT * FROM collections WHERE id = ?').bind(collectionId).first<Record<string, unknown>>();
  if (!existing) return json({ error: 'Collection not found' }, { status: 404 });
  const body = await readBody(request);
  const name = body.name === undefined ? String(existing.name) : String(body.name).trim();
  if (!name) return json({ error: 'Name is required' }, { status: 400 });
  let schema = storedSchema(existing.schema_json);
  if (body.schema !== undefined) {
    const parsed = schemaInput(body.schema);
    if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
    schema = parsed.schema;
  }
  const timestamp = now();
  await env.VENDA_DB.prepare('UPDATE collections SET name = ?, schema_json = ?, updated_at = ? WHERE id = ?').bind(name, JSON.stringify(schema), timestamp, collectionId).run();
  await invalidate(env, collectionId);
  return json(collection({ ...existing, name, schema_json: JSON.stringify(schema), updated_at: timestamp }));
}

async function collectionEntries(request: Request, env: Env, collectionId: string): Promise<Response> {
  const schema = await collectionSchema(env, collectionId);
  if (!schema) return json({ error: 'Collection not found' }, { status: 404 });
  if (request.method === 'GET') {
    const rows = await env.VENDA_DB.prepare('SELECT * FROM entries WHERE collection_id = ? ORDER BY updated_at DESC').bind(collectionId).all();
    return json(rows.results.map(entry));
  }
  const body = await readBody(request);
  const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
  if (!slug) return json({ error: 'Entry slug is required' }, { status: 400 });
  const data = objectInput(body.data ?? {});
  const status = statusInput(body.status ?? 'draft');
  const errors = entryErrors(schema, data, status);
  if (errors.length) return invalidFields(errors);
  const timestamp = now();
  const entryId = id();
  try {
    await env.VENDA_DB.prepare('INSERT INTO entries (id, collection_id, slug, data_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(entryId, collectionId, slug, JSON.stringify(data), status, timestamp, timestamp).run();
  } catch { return json({ error: 'Entry slug already exists in this collection' }, { status: 409 }); }
  await invalidate(env, collectionId);
  return json(entry({ id: entryId, collection_id: collectionId, slug, data_json: JSON.stringify(data), status, created_at: timestamp, updated_at: timestamp }), { status: 201 });
}

async function getEntry(env: Env, entryId: string): Promise<Response> {
  const row = await env.VENDA_DB.prepare('SELECT * FROM entries WHERE id = ?').bind(entryId).first<Record<string, unknown>>();
  return row ? json(entry(row)) : json({ error: 'Entry not found' }, { status: 404 });
}

async function updateEntry(request: Request, env: Env, entryId: string): Promise<Response> {
  const existing = await env.VENDA_DB.prepare('SELECT * FROM entries WHERE id = ?').bind(entryId).first<Record<string, unknown>>();
  if (!existing) return json({ error: 'Entry not found' }, { status: 404 });
  const body = await readBody(request);
  const slug = body.slug === undefined ? String(existing.slug) : slugify(String(body.slug));
  if (!slug) return json({ error: 'Entry slug is required' }, { status: 400 });
  const data = body.data === undefined ? JSON.parse(String(existing.data_json)) : objectInput(body.data);
  const status = body.status === undefined ? statusInput(existing.status) : statusInput(body.status);
  const schema = await collectionSchema(env, String(existing.collection_id));
  const errors = schema ? entryErrors(schema, data, status) : [];
  if (errors.length) return invalidFields(errors);
  const timestamp = now();
  try {
    await env.VENDA_DB.prepare('UPDATE entries SET slug = ?, data_json = ?, status = ?, updated_at = ? WHERE id = ?').bind(slug, JSON.stringify(data), status, timestamp, entryId).run();
  } catch { return json({ error: 'Entry slug already exists in this collection' }, { status: 409 }); }
  await invalidate(env, String(existing.collection_id));
  return json(entry({ ...existing, slug, data_json: JSON.stringify(data), status, updated_at: timestamp }));
}

async function mediaUpload(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'A file field is required' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return json({ error: 'Maximum file size is 10MB' }, { status: 413 });
  const key = `${crypto.randomUUID()}-${slugify(file.name) || 'upload'}`;
  await env.VENDA_MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const createdAt = now();
  await env.VENDA_DB.prepare('INSERT INTO media (id, object_key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id(), key, file.name, file.type || 'application/octet-stream', file.size, createdAt).run();
  return json({ key, filename: file.name, contentType: file.type, size: file.size, createdAt }, { status: 201 });
}

async function invalidate(env: Env, collectionId: string): Promise<void> { await env.VENDA_CACHE.delete(`content:${collectionId}`); }

async function publicContent(request: Request, env: Env, slug: string, entrySlug?: string): Promise<Response> {
  const collectionRow = await env.VENDA_DB.prepare('SELECT id FROM collections WHERE slug = ?').bind(slug).first<{ id: string }>();
  if (!collectionRow) return json({ error: 'Collection not found' }, { status: 404 });
  const query = entrySlug ? 'SELECT * FROM entries WHERE collection_id = ? AND slug = ? AND status = ?' : 'SELECT * FROM entries WHERE collection_id = ? AND status = ? ORDER BY updated_at DESC';
  const statement = entrySlug ? env.VENDA_DB.prepare(query).bind(collectionRow.id, entrySlug, 'published') : env.VENDA_DB.prepare(query).bind(collectionRow.id, 'published');
  const rows = await statement.all();
  if (entrySlug && !rows.results[0]) return json({ error: 'Entry not found' }, { status: 404 });
  const result = entrySlug ? entry(rows.results[0] as Record<string, unknown>) : rows.results.map((row) => entry(row));
  return json(result, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  // Self-hosted installs serve the admin SPA from the same Worker; anything
  // outside /api is an asset request.
  if (!path.startsWith('/api')) return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: 'Not found' }, { status: 404 });
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (path === '/api/health' && request.method === 'GET') return json({ ok: true, version: env.VENDA_VERSION ?? 'dev' });
    if (path === '/api/auth/login' && request.method === 'POST') return login(request, env);
    if (path === '/api/auth/logout' && request.method === 'POST') { await destroySession(request, env); return cookieResponse(json({ ok: true }), expiredCookie); }
    if (path === '/api/auth/me' && request.method === 'GET') return json({ email: await sessionEmail(request, env) });
    if (path.startsWith('/api/content/')) { const parts = path.split('/').filter(Boolean); return publicContent(request, env, parts[2] ?? '', parts[3]); }
    if (path.startsWith('/api/media/') && request.method === 'GET') { const object = await env.VENDA_MEDIA.get(path.slice('/api/media/'.length)); if (!object) return json({ error: 'Media not found' }, { status: 404 }); const headers = new Headers(); if (object.httpMetadata?.contentType) headers.set('Content-Type', object.httpMetadata.contentType); return new Response(object.body, { headers }); }
    const denied = await requireAdmin(request, env); if (denied) return denied;
    if (path === '/api/collections' && ['GET', 'POST'].includes(request.method)) return collections(request, env);
    const collectionOnly = path.match(/^\/api\/collections\/([^/]+)$/)?.[1]; if (collectionOnly && request.method === 'PATCH') return updateCollection(request, env, collectionOnly);
    const collectionMatch = path.match(/^\/api\/collections\/([^/]+)\/entries$/); const collectionId = collectionMatch?.[1]; if (collectionId && ['GET', 'POST'].includes(request.method)) return collectionEntries(request, env, collectionId);
    const entryMatch = path.match(/^\/api\/entries\/([^/]+)$/); const entryId = entryMatch?.[1]; if (entryId && request.method === 'GET') return getEntry(env, entryId); if (entryId && request.method === 'PATCH') return updateEntry(request, env, entryId);
    if (entryId && request.method === 'DELETE') { await env.VENDA_DB.prepare('DELETE FROM entries WHERE id = ?').bind(entryId).run(); return json({ ok: true }); }
    if (path === '/api/media' && request.method === 'POST') return mediaUpload(request, env);
    return json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 400 }); }
}

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const response = await handle(request, env);
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const cors = corsHeaders(request.method, path, request.headers.get('Origin'), allowedAdminOrigins(env.ADMIN_ORIGINS));
  if (!cors) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
} };
