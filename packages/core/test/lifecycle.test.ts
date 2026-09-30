import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coreMigrationsDir, sqlite } from '../src/adapters/node';
import { createHarness, signedInAdmin, type Client, type Harness } from './harness';

let h: Harness;
let admin: Client;
let collectionId = '';

const SCHEMA = { titleField: 'title', fields: [{ key: 'title', interface: 'input', required: true }, { key: 'body', interface: 'wysiwyg' }, { key: 'tags', interface: 'tags' }] };
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

interface EntryJson { id: string; slug: string; status: string; data: Record<string, unknown>; hasUnpublishedChanges: boolean; publishedAt: string | null; publishAt: string | null; scheduleError: string | null; deletedAt: string | null }

beforeEach(async () => {
  h = await createHarness();
  admin = await signedInAdmin(h);
  ({ id: collectionId } = await admin.data<{ id: string }>('/api/collections', { method: 'POST', json: { name: 'Posts', schema: SCHEMA } }));
});
afterEach(() => h.close());

const create = (slug: string, data: Record<string, unknown> = { title: slug }) => admin.data<EntryJson>(`/api/collections/${collectionId}/entries`, { method: 'POST', json: { slug, data } });
const save = (id: string, data: Record<string, unknown>) => admin.data<EntryJson>(`/api/entries/${id}`, { method: 'PATCH', json: { data } });
const publish = (id: string) => admin.data<EntryJson>(`/api/entries/${id}/publish`, { method: 'POST' });
const publicEntry = (slug: string) => h.client().call(`/api/content/posts/${slug}`);

describe('working copy and published snapshot', () => {
  it('keeps live content unchanged until the next publish', async () => {
    const entry = await create('hello', { title: 'First' });
    const published = await publish(entry.id);
    expect(published).toMatchObject({ status: 'published', hasUnpublishedChanges: false });
    const firstPublishedAt = published.publishedAt;

    expect(await save(entry.id, { title: 'Second' })).toMatchObject({ hasUnpublishedChanges: true, data: { title: 'Second' } });
    expect(await (await publicEntry('hello')).json()).toMatchObject({ data: { title: 'First' } });

    expect((await publish(entry.id)).publishedAt).toBe(firstPublishedAt);
    expect(await (await publicEntry('hello')).json()).toMatchObject({ data: { title: 'Second' } });

    await admin.data(`/api/entries/${entry.id}/unpublish`, { method: 'POST' });
    expect((await publicEntry('hello')).status).toBe(404);
  });

  it('allows incomplete drafts but enforces required fields on publish', async () => {
    const entry = await create('untitled', {});
    const response = await admin.call(`/api/entries/${entry.id}/publish`, { method: 'POST' });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ fields: [{ field: 'title' }] });
  });
});

describe('revisions', () => {
  it('records publishes, throttles saves and restores into the working copy', async () => {
    const entry = await create('story', { title: 'v1' });
    await publish(entry.id);
    await save(entry.id, { title: 'v2' });
    await save(entry.id, { title: 'v3' });
    const revisions = await admin.data<{ id: string; reason: string; data: { title: string } }[]>(`/api/entries/${entry.id}/revisions`);
    // Both saves fall within 10 minutes of the publish revision, so neither is recorded; the
    // latest state is always the working copy itself.
    expect(revisions.map(r => [r.reason, r.data.title])).toEqual([['publish', 'v1']]);
    expect(await admin.data(`/api/entries/${entry.id}`)).toMatchObject({ data: { title: 'v3' }, hasUnpublishedChanges: true });

    const v1 = revisions[0]!;
    expect(await admin.data(`/api/revisions/${v1.id}/restore`, { method: 'POST' })).toMatchObject({ data: { title: 'v1' }, hasUnpublishedChanges: false });
    expect((await admin.data<{ reason: string }[]>(`/api/entries/${entry.id}/revisions`))[0]?.reason).toBe('restore');
  });

  it('keeps only the newest 50 revisions per entry', async () => {
    const entry = await create('busy', { title: 'busy' });
    for (let i = 0; i < 55; i++) await publish(entry.id);
    expect((await admin.data<unknown[]>(`/api/entries/${entry.id}/revisions`)).length).toBe(50);
  });
});

describe('scheduling', () => {
  it('validates and runs scheduled publishing and unpublishing', async () => {
    const entry = await create('launch', { title: 'Launch' });
    expect((await admin.call(`/api/entries/${entry.id}/schedule`, { method: 'PUT', json: { publishAt: '2000-01-01T00:00:00Z' } })).status).toBe(400);
    const publishAt = inDays(1).toISOString();
    const unpublishAt = inDays(2).toISOString();
    expect((await admin.call(`/api/entries/${entry.id}/schedule`, { method: 'PUT', json: { publishAt: unpublishAt, unpublishAt: publishAt } })).status).toBe(400);
    expect(await admin.data(`/api/entries/${entry.id}/schedule`, { method: 'PUT', json: { publishAt, unpublishAt } })).toMatchObject({ publishAt });

    expect(await h.venda.scheduled(new Date())).toMatchObject({ published: 0 });
    expect(await h.venda.scheduled(new Date(Date.now() + 1.5 * DAY))).toMatchObject({ published: 1 });
    expect(await (await publicEntry('launch')).json()).toMatchObject({ data: { title: 'Launch' } });
    expect(await h.venda.scheduled(new Date(Date.now() + 2.5 * DAY))).toMatchObject({ unpublished: 1 });
    expect((await publicEntry('launch')).status).toBe(404);
  });

  it('refuses to schedule incomplete entries and reports scheduled publishes that fail', async () => {
    const empty = await create('empty', {});
    expect((await admin.call(`/api/entries/${empty.id}/schedule`, { method: 'PUT', json: { publishAt: inDays(1).toISOString() } })).status).toBe(422);

    const entry = await create('later', { title: 'Later' });
    await admin.data(`/api/entries/${entry.id}/schedule`, { method: 'PUT', json: { publishAt: inDays(1).toISOString() } });
    await save(entry.id, {});
    expect(await h.venda.scheduled(inDays(2))).toMatchObject({ published: 0, failed: 1 });
    expect(await admin.data(`/api/entries/${entry.id}`)).toMatchObject({ status: 'draft', publishAt: null, scheduleError: 'Title is required to publish.' });
    expect(await h.venda.scheduled(inDays(3))).toMatchObject({ failed: 0 });
  });
});

describe('trash', () => {
  it('unpublishes trashed entries, frees their slug and restores under a new one', async () => {
    const entry = await create('reused');
    await publish(entry.id);
    await admin.data(`/api/entries/${entry.id}`, { method: 'DELETE' });
    expect((await publicEntry('reused')).status).toBe(404);
    expect((await admin.data<EntryJson[]>(`/api/collections/${collectionId}/entries`)).length).toBe(0);
    expect((await admin.data<EntryJson[]>(`/api/collections/${collectionId}/entries?trash=1`)).map(e => e.slug)).toEqual(['reused']);
    expect((await admin.call(`/api/entries/${entry.id}`, { method: 'PATCH', json: { data: { title: 'x' } } })).status).toBe(409);

    await create('reused');
    expect(await admin.data(`/api/entries/${entry.id}/restore`, { method: 'POST' })).toMatchObject({ slug: 'reused-2', status: 'draft', deletedAt: null });
  });

  it('only deletes permanently from the trash, and purges it after 30 days', async () => {
    const kept = await create('kept');
    expect((await admin.call(`/api/entries/${kept.id}?permanent=true`, { method: 'DELETE' })).status).toBe(409);
    await admin.data(`/api/entries/${kept.id}`, { method: 'DELETE' });
    expect(await h.venda.scheduled(inDays(29))).toMatchObject({ purged: 0 });
    expect(await h.venda.scheduled(inDays(31))).toMatchObject({ purged: 1 });
    expect((await admin.call(`/api/entries/${kept.id}`)).status).toBe(404);
  });
});

describe('preview links', () => {
  it('shows the working copy to anyone with a valid, unaltered link', async () => {
    const entry = await create('secret', { title: 'Draft title' });
    const { token } = await admin.data<{ token: string }>(`/api/entries/${entry.id}/preview`, { method: 'POST' });
    const anonymous = h.client();
    expect(await anonymous.data(`/api/preview/${token}`)).toMatchObject({ slug: 'secret', status: 'draft', data: { title: 'Draft title' } });

    const [id, expires, signature] = token.split('.');
    expect((await anonymous.call(`/api/preview/${id}.${Number(expires) + 1}.${signature}`)).status).toBe(404);
    expect((await anonymous.call(`/api/preview/${id}.${expires}.forged`)).status).toBe(404);
    await admin.data(`/api/entries/${entry.id}`, { method: 'DELETE' });
    expect((await anonymous.call(`/api/preview/${token}`)).status).toBe(404);
  });
});

describe('search', () => {
  it('searches working copies for editors and published text publicly', async () => {
    const a = await create('alpha', { title: 'Edge caching guide', body: '<p>Workers and KV</p>', tags: ['cloudflare'] });
    await create('beta', { title: 'Unrelated', body: '<p>Mentions caching in passing</p>' });
    await publish(a.id);
    await save(a.id, { title: 'Edge caching guide', body: '<p>Now about Durable Objects</p>', tags: ['cloudflare'] });

    const editorHits = await admin.data<EntryJson[]>('/api/search?q=caching');
    expect(editorHits.map(e => e.slug)).toEqual(['alpha', 'beta']);
    expect((await admin.data<EntryJson[]>('/api/search?q=durable objects')).map(e => e.slug)).toEqual(['alpha']);
    expect((await admin.data<EntryJson[]>('/api/search?q=cloudflare')).map(e => e.slug)).toEqual(['alpha']);

    expect((await h.client().data<EntryJson[]>('/api/content/posts?q=workers')).map(e => e.slug)).toEqual(['alpha']);
    expect(await h.client().data('/api/content/posts?q=durable')).toEqual([]);
    expect(await h.client().data('/api/content/posts?q=passing')).toEqual([]);
    expect(await admin.data('/api/search?q=%25')).toEqual([]);
  });

  it('indexes entries that predate the search index', async () => {
    await create('old', { title: 'Legacy content' });
    await h.db.run('DELETE FROM entry_search');
    expect((await admin.data<EntryJson[]>('/api/search?q=legacy')).map(e => e.slug)).toEqual(['old']);
  });
});

describe('upgrading an existing database', () => {
  it('keeps published entries published and their content live', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'venda-migrations-'));
    for (const file of ['0001_initial.sql', '0002_users.sql']) await copyFile(join(coreMigrationsDir, file), join(dir, file));
    const db = sqlite(':memory:');
    await db.migrate(dir);
    const now = new Date().toISOString();
    await db.run('INSERT INTO collections (id, name, slug, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', 'c1', 'Posts', 'posts', '{}', now, now);
    await db.run("INSERT INTO entries (id, collection_id, slug, data_json, status, created_at, updated_at) VALUES ('e1', 'c1', 'live', '{\"title\":\"Live\"}', 'published', ?, ?)", now, now);
    await db.run("INSERT INTO entries (id, collection_id, slug, data_json, status, created_at, updated_at) VALUES ('e2', 'c1', 'wip', '{}', 'draft', ?, ?)", now, now);

    expect(await db.migrate()).toEqual(['0003_lifecycle.sql']);
    expect(await db.first('SELECT status, published_json, published_at FROM entries WHERE id = ?', 'e1')).toEqual({ status: 'published', published_json: '{"title":"Live"}', published_at: now });
    expect(await db.first('SELECT status, published_json FROM entries WHERE id = ?', 'e2')).toEqual({ status: 'draft', published_json: null });
    db.close();
    await rm(dir, { recursive: true, force: true });
  });
});
