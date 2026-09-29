import type { FieldError } from '@venda/schema';
import { createSession, destroySession, expiredCookie, secretsMatch, sessionCookie, sessionEmail, type SessionStore } from './auth';
import { collectionSchema, entryErrors, schemaInput, storedSchema } from './content-model';
import { allowedAdminOrigins, corsHeaders } from './cors';
import type { Row, VendaConfig } from './runtime';
import type { Collection, Entry, Status } from './types';
import { objectInput, slugify, statusInput } from './validation';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const json = (body: unknown, init: ResponseInit = {}): Response => Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });
const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

function toCollection(row: Row): Collection {
  return { id: String(row.id), name: String(row.name), slug: String(row.slug), schema: storedSchema(row.schema_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function toEntry(row: Row): Entry {
  return { id: String(row.id), collectionId: String(row.collection_id), slug: String(row.slug), data: JSON.parse(String(row.data_json)), status: row.status as Status, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function invalidFields(fields: FieldError[]): Response {
  return json({ error: fields[0]?.message ?? 'Some fields are invalid', fields }, { status: 422 });
}

function withHeaders(response: Response, headers: Record<string, string>, append = false): Response {
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) {
    if (append) merged.append(name, value);
    else merged.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return objectInput(await request.json());
}

/** A Venda instance: one Web-standard request handler over the configured services. */
export function createVenda(config: VendaConfig) {
  const { db, storage, kv } = config;
  const sessions: SessionStore = { kv, secret: config.sessionSecret };
  const adminOrigins = allowedAdminOrigins(Array.isArray(config.adminOrigins) ? config.adminOrigins.join(',') : config.adminOrigins);

  const invalidate = (collectionId: string) => kv.delete(`content:${collectionId}`);

  async function login(request: Request): Promise<Response> {
    const body = await readBody(request);
    const [emailOk, passwordOk] = await Promise.all([
      secretsMatch(String(body.email ?? '').trim().toLowerCase(), config.admin.email.trim().toLowerCase()),
      secretsMatch(String(body.password ?? ''), config.admin.password)
    ]);
    if (!emailOk || !passwordOk) return json({ error: 'Invalid credentials' }, { status: 401 });
    return withHeaders(json({ email: config.admin.email }), { 'Set-Cookie': sessionCookie(await createSession(config.admin.email, sessions)) }, true);
  }

  async function collections(request: Request): Promise<Response> {
    if (request.method === 'GET') return json((await db.all('SELECT * FROM collections ORDER BY created_at DESC')).map(toCollection));
    const body = await readBody(request);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = slugify(typeof body.slug === 'string' ? body.slug : name);
    if (!name || !slug) return json({ error: 'Name is required' }, { status: 400 });
    const parsed = schemaInput(body.schema);
    if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });
    const timestamp = now();
    const id = newId();
    try {
      await db.run('INSERT INTO collections (id, name, slug, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, slug, JSON.stringify(parsed.schema), timestamp, timestamp);
    } catch {
      return json({ error: 'Collection slug already exists' }, { status: 409 });
    }
    return json({ id, name, slug, schema: parsed.schema, createdAt: timestamp, updatedAt: timestamp }, { status: 201 });
  }

  // Edits the data model. Existing entries are untouched: removed fields simply
  // become unvalidated keys.
  async function updateCollection(request: Request, collectionId: string): Promise<Response> {
    const existing = await db.first('SELECT * FROM collections WHERE id = ?', collectionId);
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
    await db.run('UPDATE collections SET name = ?, schema_json = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(schema), timestamp, collectionId);
    await invalidate(collectionId);
    return json(toCollection({ ...existing, name, schema_json: JSON.stringify(schema), updated_at: timestamp }));
  }

  async function collectionEntries(request: Request, collectionId: string): Promise<Response> {
    const schema = await collectionSchema(db, collectionId);
    if (!schema) return json({ error: 'Collection not found' }, { status: 404 });
    if (request.method === 'GET') return json((await db.all('SELECT * FROM entries WHERE collection_id = ? ORDER BY updated_at DESC', collectionId)).map(toEntry));
    const body = await readBody(request);
    const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
    if (!slug) return json({ error: 'Entry slug is required' }, { status: 400 });
    const data = objectInput(body.data ?? {});
    const status = statusInput(body.status ?? 'draft');
    const errors = entryErrors(schema, data, status);
    if (errors.length) return invalidFields(errors);
    const timestamp = now();
    const id = newId();
    try {
      await db.run('INSERT INTO entries (id, collection_id, slug, data_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, collectionId, slug, JSON.stringify(data), status, timestamp, timestamp);
    } catch {
      return json({ error: 'Entry slug already exists in this collection' }, { status: 409 });
    }
    await invalidate(collectionId);
    return json(toEntry({ id, collection_id: collectionId, slug, data_json: JSON.stringify(data), status, created_at: timestamp, updated_at: timestamp }), { status: 201 });
  }

  async function updateEntry(request: Request, entryId: string): Promise<Response> {
    const existing = await db.first('SELECT * FROM entries WHERE id = ?', entryId);
    if (!existing) return json({ error: 'Entry not found' }, { status: 404 });
    const body = await readBody(request);
    const slug = body.slug === undefined ? String(existing.slug) : slugify(String(body.slug));
    if (!slug) return json({ error: 'Entry slug is required' }, { status: 400 });
    const data = body.data === undefined ? JSON.parse(String(existing.data_json)) : objectInput(body.data);
    const status = statusInput(body.status ?? existing.status);
    const schema = await collectionSchema(db, String(existing.collection_id));
    const errors = schema ? entryErrors(schema, data, status) : [];
    if (errors.length) return invalidFields(errors);
    const timestamp = now();
    try {
      await db.run('UPDATE entries SET slug = ?, data_json = ?, status = ?, updated_at = ? WHERE id = ?', slug, JSON.stringify(data), status, timestamp, entryId);
    } catch {
      return json({ error: 'Entry slug already exists in this collection' }, { status: 409 });
    }
    await invalidate(String(existing.collection_id));
    return json(toEntry({ ...existing, slug, data_json: JSON.stringify(data), status, updated_at: timestamp }));
  }

  async function deleteEntry(entryId: string): Promise<Response> {
    const existing = await db.first<{ collection_id: string }>('SELECT collection_id FROM entries WHERE id = ?', entryId);
    await db.run('DELETE FROM entries WHERE id = ?', entryId);
    if (existing) await invalidate(existing.collection_id);
    return json({ ok: true });
  }

  async function uploadMedia(request: Request): Promise<Response> {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return json({ error: 'A file field is required' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'Maximum file size is 10MB' }, { status: 413 });
    const key = `${crypto.randomUUID()}-${slugify(file.name) || 'upload'}`;
    const contentType = file.type || 'application/octet-stream';
    await storage.put(key, file, { contentType });
    const createdAt = now();
    await db.run('INSERT INTO media (id, object_key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), key, file.name, contentType, file.size, createdAt);
    return json({ key, filename: file.name, contentType, size: file.size, createdAt }, { status: 201 });
  }

  async function serveMedia(key: string): Promise<Response> {
    const object = await storage.get(key);
    if (!object) return json({ error: 'Media not found' }, { status: 404 });
    const headers = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable' });
    if (object.contentType) headers.set('Content-Type', object.contentType);
    if (object.size !== undefined) headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers });
  }

  async function publicContent(slug: string, entrySlug?: string): Promise<Response> {
    const collection = await db.first<{ id: string }>('SELECT id FROM collections WHERE slug = ?', slug);
    if (!collection) return json({ error: 'Collection not found' }, { status: 404 });
    const cacheHeaders = { headers: { 'Cache-Control': 'public, max-age=60' } };
    if (entrySlug) {
      const row = await db.first('SELECT * FROM entries WHERE collection_id = ? AND slug = ? AND status = ?', collection.id, entrySlug, 'published');
      return row ? json(toEntry(row), cacheHeaders) : json({ error: 'Entry not found' }, { status: 404 });
    }
    const rows = await db.all('SELECT * FROM entries WHERE collection_id = ? AND status = ? ORDER BY updated_at DESC', collection.id, 'published');
    return json(rows.map(toEntry), cacheHeaders);
  }

  async function route(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const { method } = request;
    if (!path.startsWith('/api')) return config.assets ? config.assets(request) : json({ error: 'Not found' }, { status: 404 });

    try {
      if (method === 'OPTIONS') return new Response(null, { status: 204 });
      if (path === '/api/health' && method === 'GET') return json({ ok: true, version: config.version ?? 'dev' });
      if (path === '/api/auth/login' && method === 'POST') return await login(request);
      if (path === '/api/auth/logout' && method === 'POST') {
        await destroySession(request, sessions);
        return withHeaders(json({ ok: true }), { 'Set-Cookie': expiredCookie }, true);
      }
      if (path === '/api/auth/me' && method === 'GET') return json({ email: await sessionEmail(request, sessions) });
      if (path.startsWith('/api/content/') && method === 'GET') {
        const [, , collection = '', entry] = path.split('/').filter(Boolean);
        return await publicContent(collection, entry);
      }
      if (path.startsWith('/api/media/') && method === 'GET') return await serveMedia(decodeURIComponent(path.slice('/api/media/'.length)));

      if (!(await sessionEmail(request, sessions))) return json({ error: 'Authentication required' }, { status: 401 });

      if (path === '/api/collections' && (method === 'GET' || method === 'POST')) return await collections(request);
      const collectionId = path.match(/^\/api\/collections\/([^/]+)$/)?.[1];
      if (collectionId && method === 'PATCH') return await updateCollection(request, collectionId);
      const entriesOf = path.match(/^\/api\/collections\/([^/]+)\/entries$/)?.[1];
      if (entriesOf && (method === 'GET' || method === 'POST')) return await collectionEntries(request, entriesOf);
      const entryId = path.match(/^\/api\/entries\/([^/]+)$/)?.[1];
      if (entryId && method === 'GET') {
        const row = await db.first('SELECT * FROM entries WHERE id = ?', entryId);
        return row ? json(toEntry(row)) : json({ error: 'Entry not found' }, { status: 404 });
      }
      if (entryId && method === 'PATCH') return await updateEntry(request, entryId);
      if (entryId && method === 'DELETE') return await deleteEntry(entryId);
      if (path === '/api/media' && method === 'POST') return await uploadMedia(request);
      return json({ error: 'Not found' }, { status: 404 });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 400 });
    }
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const response = await route(request);
      const path = new URL(request.url).pathname.replace(/\/$/, '');
      const cors = corsHeaders(request.method, path, request.headers.get('Origin'), adminOrigins);
      return cors ? withHeaders(response, cors) : response;
    }
  };
}

export type Venda = ReturnType<typeof createVenda>;
