import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, inviteUser, RECOVERY_ADMIN, signedInAdmin, type Client, type Harness } from './harness';

let h: Harness;
let admin: Client;

beforeEach(async () => {
  h = await createHarness();
  admin = await signedInAdmin(h);
});
afterEach(() => h.close());

const SCHEMA = { titleField: 'title', fields: [{ key: 'title', interface: 'input', required: true }] };

async function makeCollection(): Promise<string> {
  const { id } = await admin.data<{ id: string }>('/api/collections', { method: 'POST', json: { name: 'Posts', schema: SCHEMA } });
  return id;
}

async function makeEntry(client: Client, collectionId: string, slug: string, status = 'draft') {
  return client.call(`/api/collections/${collectionId}/entries`, { method: 'POST', json: { slug, status, data: { title: slug } } });
}

describe('invitations', () => {
  it('creates an account from a one-time invitation link', async () => {
    const { token, invitation } = await admin.data<{ token: string; invitation: { email: string } }>('/api/invitations', { method: 'POST', json: { email: 'Ed@Example.com', role: 'editor' } });
    expect(invitation.email).toBe('ed@example.com');

    const guest = h.client();
    expect(await guest.data(`/api/auth/invitations/${token}`)).toMatchObject({ email: 'ed@example.com', role: 'editor' });
    expect((await guest.call(`/api/auth/invitations/${token}`, { method: 'POST', json: { password: 'short' } })).status).toBe(422);

    await guest.data(`/api/auth/invitations/${token}`, { method: 'POST', json: { password: 'a-strong-password', name: 'Ed' } });
    expect(await guest.data('/api/auth/me')).toMatchObject({ user: { email: 'ed@example.com', name: 'Ed', role: 'editor' } });
    expect((await h.client().call(`/api/auth/invitations/${token}`)).status).toBe(404);

    const again = h.client();
    expect((await again.login('ed@example.com', 'a-strong-password')).status).toBe(200);
  });

  it('refuses to invite an existing user and lets admins revoke invitations', async () => {
    await inviteUser(h, admin, 'taken@example.com', 'author');
    expect((await admin.call('/api/invitations', { method: 'POST', json: { email: 'taken@example.com', role: 'author' } })).status).toBe(409);

    const { invitation, token } = await admin.data<{ invitation: { id: string }; token: string }>('/api/invitations', { method: 'POST', json: { email: 'later@example.com', role: 'author' } });
    expect((await admin.data<unknown[]>('/api/invitations')).length).toBe(1);
    await admin.data(`/api/invitations/${invitation.id}`, { method: 'DELETE' });
    expect((await h.client().call(`/api/auth/invitations/${token}`)).status).toBe(404);
  });

  it('is limited to administrators', async () => {
    const editor = await inviteUser(h, admin, 'ed@example.com', 'editor');
    expect((await editor.call('/api/invitations', { method: 'POST', json: { email: 'x@example.com', role: 'administrator' } })).status).toBe(403);
    expect((await editor.call('/api/users')).status).toBe(403);
  });
});

describe('roles', () => {
  it('lets contributors draft but never publish', async () => {
    const collectionId = await makeCollection();
    const contributor = await inviteUser(h, admin, 'cat@example.com', 'contributor');
    expect((await makeEntry(contributor, collectionId, 'draft-post')).status).toBe(201);
    expect((await makeEntry(contributor, collectionId, 'live-post', 'published')).status).toBe(403);
    expect((await contributor.call('/api/media', { method: 'POST', body: new FormData() })).status).toBe(403);
    expect((await contributor.call('/api/collections', { method: 'POST', json: { name: 'Nope' } })).status).toBe(403);
  });

  it('limits authors to their own entries and editors to none', async () => {
    const collectionId = await makeCollection();
    const author = await inviteUser(h, admin, 'ann@example.com', 'author');
    const other = await inviteUser(h, admin, 'bob@example.com', 'author');
    const editor = await inviteUser(h, admin, 'ed@example.com', 'editor');

    const mine = await (await makeEntry(author, collectionId, 'mine', 'published')).json() as { id: string; createdBy: string };
    expect(mine.createdBy).toBeTruthy();
    expect((await other.call(`/api/entries/${mine.id}`, { method: 'PATCH', json: { data: { title: 'hijack' } } })).status).toBe(403);
    expect((await other.call(`/api/entries/${mine.id}`, { method: 'DELETE' })).status).toBe(403);
    expect((await editor.call(`/api/entries/${mine.id}`, { method: 'PATCH', json: { data: { title: 'Edited' } } })).status).toBe(200);
    expect((await author.call(`/api/entries/${mine.id}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('lets contributors revise published entries without changing what is live', async () => {
    const collectionId = await makeCollection();
    const contributor = await inviteUser(h, admin, 'cat@example.com', 'contributor');
    const editor = await inviteUser(h, admin, 'ed@example.com', 'editor');
    const draft = await (await makeEntry(contributor, collectionId, 'pitch')).json() as { id: string };
    expect((await contributor.call(`/api/entries/${draft.id}/publish`, { method: 'POST' })).status).toBe(403);
    expect((await editor.call(`/api/entries/${draft.id}/publish`, { method: 'POST' })).status).toBe(200);

    expect((await contributor.call(`/api/entries/${draft.id}`, { method: 'PATCH', json: { data: { title: 'revised' } } })).status).toBe(200);
    expect(await h.client().data('/api/content/posts/pitch')).toMatchObject({ data: { title: 'pitch' } });
    expect((await contributor.call(`/api/entries/${draft.id}/unpublish`, { method: 'POST' })).status).toBe(403);
    expect((await contributor.call(`/api/entries/${draft.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('keeps authorship out of the public API', async () => {
    const collectionId = await makeCollection();
    await makeEntry(admin, collectionId, 'hello', 'published');
    const [entry] = await h.client().data<Record<string, unknown>[]>('/api/content/posts');
    expect(entry).not.toHaveProperty('createdBy');
    expect(entry).not.toHaveProperty('updatedBy');
  });
});

describe('user management', () => {
  it('applies role changes and disabling immediately by ending sessions', async () => {
    const collectionId = await makeCollection();
    const editor = await inviteUser(h, admin, 'ed@example.com', 'editor');
    const users = await admin.data<{ id: string; email: string }[]>('/api/users');
    const editorId = users.find(u => u.email === 'ed@example.com')!.id;

    await admin.data(`/api/users/${editorId}`, { method: 'PATCH', json: { role: 'contributor' } });
    expect((await editor.call('/api/auth/me').then(r => r.json()) as { user: unknown }).user).toBeNull();
    const back = h.client();
    await back.login('ed@example.com', 'a-strong-password');
    expect((await makeEntry(back, collectionId, 'x', 'published')).status).toBe(403);

    await admin.data(`/api/users/${editorId}`, { method: 'PATCH', json: { status: 'disabled' } });
    expect((await h.client().login('ed@example.com', 'a-strong-password')).status).toBe(401);
  });

  it('always keeps one active administrator and forbids self-deletion', async () => {
    const [owner] = await admin.data<{ id: string }[]>('/api/users');
    expect((await admin.call(`/api/users/${owner!.id}`, { method: 'PATCH', json: { role: 'editor' } })).status).toBe(409);
    expect((await admin.call(`/api/users/${owner!.id}`, { method: 'PATCH', json: { status: 'disabled' } })).status).toBe(409);
    expect((await admin.call(`/api/users/${owner!.id}`, { method: 'DELETE' })).status).toBe(409);

    await inviteUser(h, admin, 'second@example.com', 'administrator');
    const second = (await admin.data<{ id: string; email: string }[]>('/api/users')).find(u => u.email === 'second@example.com')!;
    expect((await admin.call(`/api/users/${second.id}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('keeps entries when their author is deleted', async () => {
    const collectionId = await makeCollection();
    const author = await inviteUser(h, admin, 'ann@example.com', 'author');
    const entry = await (await makeEntry(author, collectionId, 'kept')).json() as { id: string };
    const ann = (await admin.data<{ id: string; email: string }[]>('/api/users')).find(u => u.email === 'ann@example.com')!;
    await admin.data(`/api/users/${ann.id}`, { method: 'DELETE' });
    expect(await admin.data(`/api/entries/${entry.id}`)).toMatchObject({ slug: 'kept', createdBy: null });
  });
});

describe('sign-in security', () => {
  it('changes a password with the current one and signs out other sessions', async () => {
    const author = await inviteUser(h, admin, 'ann@example.com', 'author');
    const laptop = h.client();
    await laptop.login('ann@example.com', 'a-strong-password');

    expect((await author.call('/api/auth/me', { method: 'PATCH', json: { currentPassword: 'wrong-password', newPassword: 'another-strong-one' } })).status).toBe(403);
    expect((await author.call('/api/auth/me', { method: 'PATCH', json: { currentPassword: 'a-strong-password', newPassword: 'another-strong-one' } })).status).toBe(200);
    expect(await author.data('/api/auth/me')).toMatchObject({ user: { email: 'ann@example.com' } });
    expect(await laptop.data('/api/auth/me')).toMatchObject({ user: null });
    expect((await h.client().login('ann@example.com', 'another-strong-one')).status).toBe(200);
  });

  it('locks out repeated failed sign-ins', async () => {
    const attacker = h.client();
    for (let i = 0; i < 10; i++) expect((await attacker.login('ann@example.com', 'guess')).status).toBe(401);
    expect((await attacker.login('ann@example.com', 'guess')).status).toBe(429);
  });

  it('restores the recovery administrator if it was demoted', async () => {
    await inviteUser(h, admin, 'second@example.com', 'administrator');
    const second = h.client();
    await second.login('second@example.com', 'a-strong-password');
    const owner = (await second.data<{ id: string; email: string }[]>('/api/users')).find(u => u.email === RECOVERY_ADMIN.email)!;
    await second.data(`/api/users/${owner.id}`, { method: 'PATCH', json: { status: 'disabled' } });

    const recovered = h.client();
    expect((await recovered.login(RECOVERY_ADMIN.email, RECOVERY_ADMIN.password)).status).toBe(200);
    expect(await recovered.data('/api/auth/me')).toMatchObject({ user: { role: 'administrator', status: 'active' } });
  });
});

describe('API tokens', () => {
  it('authenticates scripts with scoped bearer tokens', async () => {
    const collectionId = await makeCollection();
    const { secret, token } = await admin.data<{ secret: string; token: { id: string } }>('/api/tokens', { method: 'POST', json: { name: 'CI', scopes: ['content:read'] } });
    expect(secret).toMatch(/^venda_/);

    const script = h.client();
    script.bearer = secret;
    expect((await script.call(`/api/collections/${collectionId}/entries`)).status).toBe(200);
    expect((await makeEntry(script, collectionId, 'nope')).status).toBe(403);
    expect((await script.call('/api/tokens', { method: 'POST', json: { name: 'x', scopes: ['content:read'] } })).status).toBe(403);

    await admin.data(`/api/tokens/${token.id}`, { method: 'DELETE' });
    expect((await script.call(`/api/collections/${collectionId}/entries`)).status).toBe(401);
  });

  it('never grants more than the owner’s role', async () => {
    const author = await inviteUser(h, admin, 'ann@example.com', 'author');
    expect((await author.call('/api/tokens', { method: 'POST', json: { name: 'x', scopes: ['users:manage'] } })).status).toBe(403);
    expect((await author.call('/api/tokens', { method: 'POST', json: { name: 'x', scopes: ['made:up'] } })).status).toBe(400);
  });
});
