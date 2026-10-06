import { CreatedInvitation, CreatedToken, InvalidCredentials, InvitationNotFound, LastAdministrator, User } from '@venda/contract';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { VendaApp } from '../src/app';
import { OWNER, startApp } from './support';

const BASE = 'http://venda.test';

interface Call {
  readonly method?: string;
  readonly body?: object;
  readonly cookie?: string;
  readonly bearer?: string;
  readonly origin?: string;
}

/** Calls the app as a browser on its own origin (or another, with `origin`). */
async function call(app: VendaApp, path: string, { method = 'GET', body, cookie, bearer, origin }: Call = {}) {
  const headers = new Headers({ host: 'venda.test' });

  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie !== undefined) headers.set('cookie', cookie);
  if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
  if (origin !== undefined) headers.set('origin', origin);

  const response = await app.fetch(new Request(`${BASE}/api${path}`, { method, headers, body: body === undefined ? null : JSON.stringify(body) }));
  const text = await response.text();

  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : undefined };
}

const sessionOf = (headers: Headers) => headers.getSetCookie().find(cookie => cookie.startsWith('venda_session='))?.split(';')[0] ?? '';

async function signIn(app: VendaApp, email: string, password: string) {
  const response = await call(app, '/auth/sign-in', { method: 'POST', body: { email, password } });

  return { ...response, cookie: sessionOf(response.headers) };
}

describe('accounts over HTTP', () => {
  it('signs in with an HttpOnly, SameSite cookie and signs out', async () => {
    const { app } = await startApp();
    const signedIn = await signIn(app, OWNER.email, OWNER.password);
    const set = signedIn.headers.getSetCookie().join('; ');

    expect(Schema.decodeUnknownSync(User)(signedIn.json)).toMatchObject({ email: OWNER.email, role: 'administrator' });
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect((await call(app, '/auth/me', { cookie: signedIn.cookie })).status).toBe(200);

    await call(app, '/auth/sign-out', { method: 'POST', cookie: signedIn.cookie });

    expect((await call(app, '/auth/me', { cookie: signedIn.cookie })).status).toBe(401);
    const wrong = await signIn(app, OWNER.email, 'wrong');

    expect([wrong.status, Schema.decodeUnknownSync(InvalidCredentials)(wrong.json)._tag]).toEqual([401, 'InvalidCredentials']);
  });

  it('refuses changes from another site that carry the cookie', async () => {
    const { app } = await startApp();
    const { cookie } = await signIn(app, OWNER.email, OWNER.password);
    const invite = (origin: string) => call(app, '/invitations', { method: 'POST', body: { email: 'ann@venda.test', role: 'editor' }, cookie, origin });

    expect((await invite('https://evil.example')).status).toBe(403);
    expect((await invite('http://venda.test')).status).toBe(200);
  });

  it('invites someone who joins with the link, and limits them to their role', async () => {
    const { app } = await startApp();
    const owner = await signIn(app, OWNER.email, OWNER.password);
    const created = Schema.decodeUnknownSync(CreatedInvitation)((await call(app, '/invitations', { method: 'POST', body: { email: 'ann@venda.test', role: 'author' }, cookie: owner.cookie })).json);

    expect((await call(app, `/join/${created.token}`)).json).toEqual({ email: 'ann@venda.test', role: 'author' });
    expect((await call(app, `/join/${created.token}`, { method: 'POST', body: { name: 'Ann', password: 'a long password' } })).status).toBe(200);
    const reused = await call(app, `/join/${created.token}`, { method: 'POST', body: { name: 'Ann', password: 'a long password' } });

    expect([reused.status, Schema.decodeUnknownSync(InvitationNotFound)(reused.json)._tag]).toEqual([404, 'InvitationNotFound']);

    const ann = await signIn(app, 'ann@venda.test', 'a long password');

    expect((await call(app, '/users', { cookie: ann.cookie })).status).toBe(403);
    expect((await call(app, '/users', { cookie: owner.cookie })).json).toHaveLength(2);
  });

  it('issues API tokens that work as bearer credentials until revoked', async () => {
    const { app } = await startApp();
    const { cookie } = await signIn(app, OWNER.email, OWNER.password);
    const created = Schema.decodeUnknownSync(CreatedToken)((await call(app, '/tokens', { method: 'POST', body: { name: 'CI' }, cookie })).json);

    expect((await call(app, '/auth/me', { bearer: created.secret })).json).toMatchObject({ email: OWNER.email });
    expect((await call(app, '/tokens', { method: 'POST', body: { name: 'More' }, bearer: created.secret })).status).toBe(403);
    expect((await call(app, `/tokens/${created.token.id}`, { method: 'DELETE', cookie })).status).toBe(204);
    expect((await call(app, '/auth/me', { bearer: created.secret })).status).toBe(401);
  });

  it('keeps an administrator and validates input', async () => {
    const { app } = await startApp();
    const { cookie, json } = await signIn(app, OWNER.email, OWNER.password);
    const me = Schema.decodeUnknownSync(User)(json);

    const demoted = await call(app, `/users/${me.id}`, { method: 'PATCH', body: { role: 'editor' }, cookie });

    expect([demoted.status, Schema.decodeUnknownSync(LastAdministrator)(demoted.json)._tag]).toEqual([409, 'LastAdministrator']);
    expect((await call(app, '/invitations', { method: 'POST', body: { email: 'not an email', role: 'editor' }, cookie })).status).toBe(400);
  });
});
