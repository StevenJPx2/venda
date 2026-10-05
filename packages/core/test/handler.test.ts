import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVenda, type Venda } from '../src';
import { fileStore, memoryKv, sqlite, type SqliteDatabase } from '../src/adapters/node';

const ADMIN = { email: 'admin@example.com', password: 'correct horse' };
const BASE = 'http://venda.test';

let db: SqliteDatabase;
let mediaDir: string;
let venda: Venda;
let cookie = '';

async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (cookie) headers.set('Cookie', cookie);

  let body = init.body;

  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  return venda.fetch(new Request(`${BASE}${path}`, { ...init, headers, body: body ?? null }));
}

beforeAll(async () => {
  db = sqlite(':memory:');
  expect(await db.migrate()).toEqual(['0001_initial.sql', '0002_users.sql', '0003_lifecycle.sql', '0004_content_index.sql']);
  mediaDir = await mkdtemp(join(tmpdir(), 'venda-media-'));
  venda = createVenda({
    db,
    storage: fileStore(mediaDir),
    kv: memoryKv(),
    admin: ADMIN,
    sessionSecret: 'test-secret',
    adminOrigins: ['http://admin.test'],
    version: '9.9.9',
    assets: async () => new Response('admin spa')
  });
});

afterAll(async () => {
  db.close();
  await rm(mediaDir, { recursive: true, force: true });
});

describe('Venda core on Node (SQLite + filesystem + memory KV)', () => {
  it('reports health and serves non-API paths through the asset handler', async () => {
    expect(await (await call('/api/health')).json()).toEqual({ ok: true, version: '9.9.9' });
    expect(await (await call('/editor/anything')).text()).toBe('admin spa');
  });

  it('does not re-apply migrations', async () => {
    expect(await db.migrate()).toEqual([]);
  });

  it('rejects admin requests without a session and bad credentials', async () => {
    expect((await call('/api/collections')).status).toBe(401);
    expect((await call('/api/auth/login', { method: 'POST', json: { email: ADMIN.email, password: 'nope' } })).status).toBe(401);
  });

  it('logs in with a secure session cookie', async () => {
    const response = await call('/api/auth/login', { method: 'POST', json: { email: ' ADMIN@example.com ', password: ADMIN.password } });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    cookie = setCookie.split(';')[0]!;
    expect(await (await call('/api/auth/me')).json()).toMatchObject({ email: ADMIN.email, user: { email: ADMIN.email, role: 'administrator' } });
  });

  let collectionId = '';
  let entryId = '';

  it('creates a collection and validates entries against its schema', async () => {
    const created = await call('/api/collections', { method: 'POST', json: { name: 'Blog Posts', schema: { titleField: 'title', fields: [{ key: 'title', interface: 'input', required: true }, { key: 'body', interface: 'wysiwyg' }] } } });
    expect(created.status).toBe(201);
    const collection = await created.json() as { id: string; slug: string };
    expect(collection.slug).toBe('blog-posts');
    collectionId = collection.id;

    expect((await call('/api/collections', { method: 'POST', json: { name: 'Blog Posts' } })).status).toBe(409);

    const invalid = await call(`/api/collections/${collectionId}/entries`, { method: 'POST', json: { slug: 'hello', status: 'published', data: {} } });
    expect(invalid.status).toBe(422);
    expect((await invalid.json() as { fields: { field: string }[] }).fields[0]?.field).toBe('title');

    const draft = await call(`/api/collections/${collectionId}/entries`, { method: 'POST', json: { slug: 'Hello World', data: { title: 'Hello' } } });
    expect(draft.status).toBe(201);
    const entry = await draft.json() as { id: string; slug: string; status: string };
    expect(entry).toMatchObject({ slug: 'hello-world', status: 'draft' });
    entryId = entry.id;
  });

  it('only exposes published entries publicly', async () => {
    expect(await (await call('/api/content/blog-posts')).json()).toEqual([]);
    expect((await call('/api/content/blog-posts/hello-world')).status).toBe(404);

    expect((await call(`/api/entries/${entryId}`, { method: 'PATCH', json: { data: { title: 'Hello', body: '<p>Hi</p>' } } })).status).toBe(200);
    expect((await call(`/api/entries/${entryId}`, { method: 'PATCH', json: { status: 'published' } })).status).toBe(400);
    expect((await call(`/api/entries/${entryId}/publish`, { method: 'POST' })).status).toBe(200);

    const list = await call('/api/content/blog-posts');
    expect(list.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect((await list.json() as unknown[]).length).toBe(1);
    // Rich text is always served as a document, whatever format it was written in.
    expect(await (await call('/api/content/blog-posts/hello-world')).json()).toMatchObject({ data: { title: 'Hello', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] } } });
  });

  it('serves stored HTML as a document and rejects malformed documents', async () => {
    // Content written before documents were the storage format.
    const legacyData = JSON.stringify({ title: 'Hello', body: '<h2>Old</h2><p>html</p><p></p>' });
    await db.run('UPDATE entries SET data_json = ?, published_json = ? WHERE id = ?', legacyData, legacyData, entryId);
    const legacy = await (await call('/api/content/blog-posts/hello-world')).json() as { data: { body: { content: unknown[] } } };
    expect(legacy.data.body.content).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Old' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'html' }] }
    ]);
    const bad = await call(`/api/entries/${entryId}`, { method: 'PATCH', json: { data: { title: 'Hello', body: { type: 'doc', content: [{ type: 'text' }] } } } });
    expect(bad.status).toBe(422);
  });

  it('uploads media and serves it back from storage', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'Photo 1.png', { type: 'image/png' }));
    const uploaded = await call('/api/media', { method: 'POST', body: form });
    expect(uploaded.status).toBe(201);
    const { key } = await uploaded.json() as { key: string };
    expect(key).toMatch(/-photo-1-png$/);

    const served = await call(`/api/media/${key}`);
    expect(served.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect((await call('/api/media/missing')).status).toBe(404);
  });

  it('applies the CORS policy', async () => {
    const pub = await call('/api/content/blog-posts', { headers: { Origin: 'https://site.test' } });
    expect(pub.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const admin = await call('/api/collections', { headers: { Origin: 'http://admin.test' } });
    expect(admin.headers.get('Access-Control-Allow-Origin')).toBe('http://admin.test');
    const stranger = await call('/api/collections', { headers: { Origin: 'https://evil.test' } });
    expect(stranger.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('trashes entries and revokes the session on logout', async () => {
    expect((await call(`/api/entries/${entryId}`, { method: 'DELETE' })).status).toBe(200);
    expect(await (await call('/api/content/blog-posts')).json()).toEqual([]);
    expect((await call(`/api/entries/${entryId}?permanent=true`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/api/entries/${entryId}`)).status).toBe(404);

    const copied = cookie;
    await call('/api/auth/logout', { method: 'POST' });
    cookie = copied;
    expect((await call('/api/collections')).status).toBe(401);
  });
});
