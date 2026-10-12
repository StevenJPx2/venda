// Local file writes require a per-run secret and a conditional SHA. All disk
// operations in the compare/write step are synchronous: HTTP writers cannot
// interleave. A temporary file is renamed over the destination atomically.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, sep } from 'node:path';

const PATH = /^(?:site\.ts|[a-z0-9-]+\/(?:config\.ts|[a-z0-9-]+\.mdx?))$/;
const LIMIT = 1_048_576;

const shaOf = bytes =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');

function authorized(request, token) {
  const received = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return (
    token &&
    !request.headers.origin &&
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

async function bodyOf(request) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;

    if (length > LIMIT) return undefined;

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function currentFile(path) {
  try {
    if (lstatSync(path).isSymbolicLink())
      throw new Error('Symlinks are not writable');

    return readFileSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;

    throw error;
  }
}

function replace(root, key, bytes, request, response) {
  const path = join(root, key);
  const parent = realpathSync(dirname(path));

  if (parent !== root && !parent.startsWith(root + sep))
    return response.writeHead(403).end();

  const current = currentFile(path);
  const sha = current ? shaOf(current) : null;
  const wanted = shaOf(bytes);
  const matches =
    sha === null
      ? request.headers['if-none-match'] === '*'
      : request.headers['if-match'] === `"${sha}"`;
  // A retry of a durable intent that already wrote these bytes is complete.
  const retry =
    sha === wanted && request.headers['x-venda-content-sha'] === wanted;

  if (!matches && !retry)
    return response.writeHead(412, sha ? { etag: `"${sha}"` } : {}).end();

  if (retry) return response.writeHead(200, { etag: `"${wanted}"` }).end();

  const temporary = join(parent, `.venda-${randomUUID()}`);

  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT')
        console.error('[content-server] temporary file cleanup failed', error);
    }
  }

  response.writeHead(200, { etag: `"${wanted}"` }).end();
}

export async function writeContent(root, token, key, request, response) {
  if (!authorized(request, token)) return response.writeHead(403).end();
  if (!PATH.test(key)) return response.writeHead(400).end();

  const bytes = await bodyOf(request);

  if (!bytes) return response.writeHead(413).end();
  if (!request.headers['if-match'] && request.headers['if-none-match'] !== '*')
    return response.writeHead(428).end();

  replace(root, key, bytes, request, response);
}
