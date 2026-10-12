// The local content server's contract with the Worker (src/local-content.ts):
// storage keys, file bytes, a version that moves on edits, and no way out of
// the folder.
import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  symlink,
  rm
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { serveContent } from './content-server.mjs';

const PORT = 8899;
const base = `http://127.0.0.1:${PORT}`;

const shaOf = text =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest('hex');

async function folder() {
  const root = await mkdtemp(join(tmpdir(), 'venda-content-server-'));

  await mkdir(join(root, 'journal'));
  await writeFile(join(root, 'journal/hello.md'), '---\ntitle: Hello\n---\n');
  await writeFile(join(root, 'outside.txt'), 'not content, but in the folder');

  return root;
}

test('lists storage keys and serves file bytes', async t => {
  const stop = await serveContent(await folder(), PORT);

  t.after(stop);

  const keys = await (await fetch(`${base}/keys`)).json();
  const file = await fetch(
    `${base}/files/${encodeURIComponent('journal:hello.md')}`
  );

  assert.deepEqual(keys.sort(), ['journal:hello.md', 'outside.txt']);
  assert.equal(await file.text(), '---\ntitle: Hello\n---\n');
  assert.equal((await fetch(`${base}/files/journal%3Amissing.md`)).status, 404);
});

test('refuses keys that would leave the folder', async t => {
  const root = await folder();
  const stop = await serveContent(join(root, 'journal'), PORT);

  t.after(stop);

  for (const key of ['..:outside.txt', '..:..:etc:passwd', '/etc/passwd'])
    assert.equal(
      (await fetch(`${base}/files/${encodeURIComponent(key)}`)).status,
      404,
      key
    );
});

test('moves its version after an edit settles', async t => {
  const root = await folder();
  const stop = await serveContent(root, PORT);

  t.after(stop);

  const version = async () => (await fetch(`${base}/version`)).text();
  const before = await version();

  await writeFile(join(root, 'journal/hello.md'), '---\ntitle: Edited\n---\n');

  let after = before;

  for (let attempt = 0; attempt < 40 && after === before; attempt++) {
    await new Promise(done => setTimeout(done, 25));
    after = await version();
  }

  assert.notEqual(after, before);
});

test('conditional writes require a secret and reject browser origins and stale SHAs', async t => {
  const root = await folder();
  const stop = await serveContent(root, PORT, 'local-secret');

  t.after(stop);
  t.after(() => rm(root, { recursive: true, force: true }));

  const url = `${base}/files/journal%2Fhello.md`;
  const original = await readFile(join(root, 'journal/hello.md'), 'utf8');
  const put = headers =>
    fetch(url, { method: 'PUT', body: 'Changed', headers });
  const authorized = {
    authorization: 'Bearer local-secret',
    'if-match': `"${shaOf(original)}"`
  };

  assert.equal((await put({})).status, 403);
  assert.equal(
    (await put({ ...authorized, origin: 'https://evil.example' })).status,
    403
  );
  assert.equal(
    (await put({ authorization: 'Bearer local-secret' })).status,
    428
  );
  assert.equal((await put(authorized)).status, 200);
  assert.equal((await put(authorized)).status, 412);
  assert.equal(
    await readFile(join(root, 'journal/hello.md'), 'utf8'),
    'Changed'
  );

  const retry = await put({
    ...authorized,
    'x-venda-content-sha': shaOf('Changed')
  });

  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get('etag'), `"${shaOf('Changed')}"`);
});

test('new writes cannot escape the folder or replace a symlink target', async t => {
  const root = await folder();
  const outside = await folder();
  const stop = await serveContent(root, PORT, 'local-secret');

  t.after(stop);
  t.after(() =>
    Promise.all(
      [root, outside].map(dir => rm(dir, { recursive: true, force: true }))
    )
  );

  const put = (key, body = 'New') =>
    fetch(`${base}/files/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body,
      headers: { authorization: 'Bearer local-secret', 'if-none-match': '*' }
    });

  assert.equal((await put('../outside.md')).status, 400);
  assert.equal((await put('journal/new.md')).status, 200);
  assert.equal((await put('journal/new.md', 'Other')).status, 412);
  assert.equal(
    (await put('journal/huge.md', 'x'.repeat(1_048_577))).status,
    413
  );
  await symlink(join(outside, 'journal'), join(root, 'escape'));

  assert.equal((await put('escape/new.md')).status, 403);
  assert.equal((await fetch(`${base}/files/escape%3Ahello.md`)).status, 404);
  assert.equal(
    await readFile(join(outside, 'journal/hello.md'), 'utf8'),
    '---\ntitle: Hello\n---\n'
  );
});
