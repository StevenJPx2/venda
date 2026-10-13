import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedEmails,
  forVisitor,
  tunnelArgs,
  tunnelUrl
} from './try-tunnel.mjs';

test('finds the tunnel address in cloudflared output, never the API host', () => {
  assert.equal(
    tunnelUrl(
      'INF |  https://quiet-fern-river.trycloudflare.com                   |'
    ),
    'https://quiet-fern-river.trycloudflare.com'
  );
  assert.equal(
    tunnelUrl(
      'ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"'
    ),
    undefined
  );
  assert.equal(tunnelUrl('INF Starting tunnel'), undefined);
});

test('allows the listed addresses, else the git user, and nobody by default', () => {
  assert.deepEqual(
    allowedEmails(
      { VENDA_TRY_TUNNEL_EMAILS: ' ann@a.test, *@team.test ,ann@a.test,' },
      'me@git.test'
    ),
    ['ann@a.test', '*@team.test']
  );
  assert.deepEqual(allowedEmails({}, 'me@git.test'), ['me@git.test']);
  assert.deepEqual(allowedEmails({}, undefined), []);
  assert.deepEqual(allowedEmails({ VENDA_TRY_TUNNEL_EMAILS: ' ' }, 'x'), []);
});

test('gates every tunnel by email', () => {
  assert.deepEqual(tunnelArgs(8805, ['ann@a.test', 'bo@a.test']), [
    'tunnel',
    '--no-autoupdate',
    '--url',
    'http://localhost:8805',
    '--allowed-mail',
    'ann@a.test',
    '--allowed-mail',
    'bo@a.test'
  ]);
});

test('points try pages at the Worker tunnel only for visitors through the page tunnel', () => {
  const tunnels = {
    worker: 'https://worker-x.trycloudflare.com',
    page: 'https://page-y.trycloudflare.com'
  };
  const html = '<a href="http://localhost:8805/admin/">Admin</a>';

  assert.equal(
    forVisitor(
      html,
      'page-y.trycloudflare.com',
      tunnels,
      'http://localhost:8805'
    ),
    '<a href="https://worker-x.trycloudflare.com/admin/">Admin</a>'
  );
  assert.equal(
    forVisitor(html, 'localhost:8794', tunnels, 'http://localhost:8805'),
    html
  );
  assert.equal(
    forVisitor(
      html,
      'page-y.trycloudflare.com',
      { page: tunnels.page },
      'http://localhost:8805'
    ),
    html
  );
  assert.equal(
    forVisitor(html, 'page-y.trycloudflare.com', undefined, 'x'),
    html
  );
});
