// The local content server's contract with the Worker (src/local-content.ts):
// storage keys, file bytes, a version that moves on edits, and no way out of
// the folder.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { serveContent } from './content-server.mjs';

const PORT = 8899;
const base = `http://127.0.0.1:${PORT}`;

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
