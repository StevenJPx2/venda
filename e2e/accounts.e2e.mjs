// Accounts: signing in with a cookie, roles, invitations and API tokens,
// through the real server on local workerd, with KV sessions and D1.
import {
  buildWorkers,
  check,
  OWNER,
  startWorkers,
  suite,
  WORKERS,
  workersState
} from './support.mjs';

/** A client that keeps the session cookie, like a browser on the server's own origin. */
function client(base) {
  let cookie = '';

  return async (path, { method = 'GET', body, bearer, origin } = {}) => {
    const headers = {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(origin ? { origin } : {})
    };
    const init = { method, headers };

    if (body) init.body = JSON.stringify(body);

    const response = await fetch(`${base}/api${path}`, init);
    const session = response.headers
      .getSetCookie()
      .find(each => each.startsWith('venda_session='));

    if (session) cookie = session.split(';')[0];

    const text = await response.text();

    return {
      status: response.status,
      json: text ? JSON.parse(text) : undefined,
      setCookie: session ?? ''
    };
  };
}

async function accountChecks(label, base) {
  const owner = client(base);
  const signedIn = await owner('/auth/sign-in', {
    method: 'POST',
    body: OWNER
  });

  check(
    `${label}: the owner signs in with an HttpOnly, SameSite=Lax, Secure cookie kept for 30 days`,
    signedIn.status === 200 &&
      /HttpOnly/i.test(signedIn.setCookie) &&
      /SameSite=Lax/i.test(signedIn.setCookie) &&
      /Secure/i.test(signedIn.setCookie) &&
      /Max-Age=2592000(;|$)/.test(signedIn.setCookie),
    signedIn.setCookie
  );
  check(
    `${label}: a wrong password is refused without saying why`,
    (
      await client(base)('/auth/sign-in', {
        method: 'POST',
        body: { ...OWNER, password: 'wrong' }
      })
    ).json?._tag === 'InvalidCredentials'
  );
  check(
    `${label}: a changing request from another site is refused`,
    (
      await owner('/invitations', {
        method: 'POST',
        body: { email: 'x@venda.test', role: 'editor' },
        origin: 'https://evil.example'
      })
    ).status === 403
  );

  const invited = await owner('/invitations', {
    method: 'POST',
    body: { email: 'ann@venda.test', role: 'author' }
  });
  const ann = client(base);
  const joined = await ann(`/join/${invited.json?.token}`, {
    method: 'POST',
    body: { name: 'Ann', password: 'a long password' }
  });

  check(
    `${label}: an invited person joins once with the link`,
    joined.status === 200 &&
      (await ann(`/join/${invited.json?.token}`)).status === 404,
    JSON.stringify(joined.json)
  );
  await ann('/auth/sign-in', {
    method: 'POST',
    body: { email: 'ann@venda.test', password: 'a long password' }
  });
  check(
    `${label}: an author cannot manage people; the owner can`,
    (await ann('/users')).status === 403 &&
      (await owner('/users')).json?.length === 2
  );

  const token = await owner('/tokens', {
    method: 'POST',
    body: { name: 'CI' }
  });
  const script = client(base);

  check(
    `${label}: an API token works as a bearer credential`,
    (await script('/auth/me', { bearer: token.json?.secret })).json?.email ===
      OWNER.email
  );
  check(
    `${label}: a token cannot make more tokens`,
    (
      await script('/tokens', {
        method: 'POST',
        body: { name: 'More' },
        bearer: token.json?.secret
      })
    ).status === 403
  );
  await owner(`/tokens/${token.json?.token?.id}`, { method: 'DELETE' });
  check(
    `${label}: a revoked token stops working`,
    (await script('/auth/me', { bearer: token.json?.secret })).status === 401
  );

  const annId = (await ann('/auth/me')).json?.id;

  await owner(`/users/${annId}`, {
    method: 'PATCH',
    body: { status: 'disabled' }
  });
  check(
    `${label}: disabling someone ends their session at once`,
    (await ann('/auth/me')).status === 401
  );

  return owner;
}

await suite('accounts', async () => {
  const state = await workersState();

  await buildWorkers();

  let stopWorkers = await startWorkers(state);
  const owner = await accountChecks('Workers', WORKERS);

  await stopWorkers();
  stopWorkers = await startWorkers(state);
  check(
    'Workers: sessions and accounts survive a restart',
    (await owner('/auth/me')).status === 200 &&
      (await owner('/users')).json?.length === 2
  );
  await stopWorkers();
});
