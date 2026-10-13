import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connected,
  forVisitor,
  localOnly,
  tunnelConfig
} from './try-tunnel.mjs';

test('reads the tunnel settings, or says what is missing', () => {
  assert.deepEqual(
    tunnelConfig(
      JSON.stringify({
        tokenFile: '~/.cloudflared/venda-try.token',
        worker: 'https://venda.example.com/admin/',
        pages: 'https://venda-try.example.com'
      }),
      '/home/ann'
    ),
    {
      tokenFile: '/home/ann/.cloudflared/venda-try.token',
      worker: 'https://venda.example.com',
      pages: 'https://venda-try.example.com'
    }
  );
  assert.match(tunnelConfig(undefined, '/h').note, /no \.try-tunnel\.json/);
  assert.match(
    tunnelConfig(JSON.stringify({ tokenFile: 'x', worker: 'not a url' }), '/h')
      .note,
    /needs tokenFile, worker and pages/
  );
});

test('knows when cloudflared is serving', () => {
  assert.equal(
    connected('INF Registered tunnel connection connIndex=0 location=sin01'),
    true
  );
  assert.equal(connected('INF Starting tunnel tunnelID=abc'), false);
});

test('points try pages at the Worker’s public address only for visitors through the tunnel', () => {
  const tunnel = {
    worker: 'https://venda.example.com',
    pages: 'https://venda-try.example.com'
  };
  const html = '<a href="http://localhost:8805/admin/">Admin</a>';

  assert.equal(
    forVisitor(html, 'venda-try.example.com', tunnel, 'http://localhost:8805'),
    '<a href="https://venda.example.com/admin/">Admin</a>'
  );
  assert.equal(
    forVisitor(html, 'localhost:8794', tunnel, 'http://localhost:8805'),
    html
  );
  assert.equal(forVisitor(html, 'venda-try.example.com', undefined, 'x'), html);
});

test('keeps the helpers that act on this machine to this machine', () => {
  for (const path of [
    '/cli/run',
    '/cli/login',
    '/files/site.ts',
    '/compile-mistakes'
  ]) {
    assert.equal(localOnly(path, 'venda-try.example.com'), true, path);
    assert.equal(localOnly(path, 'localhost:8794'), false, path);
    assert.equal(localOnly(path, '127.0.0.1:8794'), false, path);
    assert.equal(localOnly(path, undefined), true, path);
  }

  assert.equal(localOnly('/slice-5', 'venda-try.example.com'), false);
  assert.equal(
    localOnly('/api/content/journal', 'venda-try.example.com'),
    false
  );
  assert.equal(localOnly('/cli/run', 'localhost.evil.test'), true);
});
