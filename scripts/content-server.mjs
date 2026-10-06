// Serves a content folder to a local Worker, which cannot read the disk
// (packages/server/src/local-content.ts is the other side). Start the Worker
// with VENDA_CONTENT_URL set to this server's address. Local only: it listens
// on 127.0.0.1 and refuses paths outside the folder.
//
//   GET /keys          every file, as storage keys (`journal:a-quiet-start.md`)
//   GET /files/<key>   a file's bytes, or 404
//   GET /version       changes whenever a file under the folder does
import { watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';

// Editors save in bursts (write, rename, touch); the version moves once they settle.
const SETTLE_MS = 100;

async function keysIn(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter(entry => entry.isFile())
    .map(entry =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join(':')
    );
}

/** The file a key names, or undefined when it would leave the folder. */
function fileFor(root, key) {
  const path = resolve(root, ...key.split(':'));

  return path.startsWith(root + sep) ? path : undefined;
}

async function answer(root, version, url, response) {
  if (url.pathname === '/version')
    return response
      .writeHead(200, { 'content-type': 'text/plain' })
      .end(version());

  if (url.pathname === '/keys')
    return response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify(await keysIn(root)));

  const key = url.pathname.startsWith('/files/')
    ? decodeURIComponent(url.pathname.slice('/files/'.length))
    : undefined;
  const path = key && fileFor(root, key);
  const bytes = path && (await readFile(path).catch(() => undefined));

  if (!bytes) return response.writeHead(404).end();

  response
    .writeHead(200, { 'content-type': 'application/octet-stream' })
    .end(bytes);
}

/** Serves `dir` on 127.0.0.1:`port`; resolves to a function that stops serving and watching. */
export async function serveContent(dir, port) {
  const root = resolve(dir);
  const started = Date.now();
  let edits = 0;
  let settle;

  const watcher = watch(root, { recursive: true }, () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      edits++;
    }, SETTLE_MS);
  });

  // A restarted server never repeats a version an older Worker already saw.
  const version = () => `${started}:${edits}`;

  const server = createServer((request, response) => {
    answer(
      root,
      version,
      new URL(request.url ?? '/', 'http://localhost'),
      response
    ).catch(error => {
      console.error('[content-server]', error);
      response.writeHead(500).end();
    });
  });

  watcher.on('error', error =>
    console.error('[content-server] watch failed', error)
  );
  await new Promise(done => server.listen(port, '127.0.0.1', done));

  return async () => {
    clearTimeout(settle);
    watcher.close();
    await new Promise(done => server.close(done));
  };
}
