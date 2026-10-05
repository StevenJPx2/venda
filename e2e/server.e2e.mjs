// The Nitro server on both runtimes: the Effect contract endpoint, media through
// unstorage (R2 on Workers, files on Node), and SQLite persistence on Node.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API, CONTENT_FIXTURES, OWNER, ROOT, check, startApi, suite } from './support.mjs';

const NODE_PORT = 8797;
const NODE = `http://localhost:${NODE_PORT}`;
const SERVER = `${ROOT}/packages/server`;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function signIn(base) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(OWNER) });

  return response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
}

async function mediaRoundTrip(base, cookie) {
  const form = new FormData();

  form.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  const uploaded = await (await fetch(`${base}/api/media`, { method: 'POST', headers: { Cookie: cookie }, body: form })).json();
  const served = await fetch(`${base}/api/media/${uploaded.key}`);
  const bytes = new Uint8Array(await served.arrayBuffer());

  return served.ok && served.headers.get('content-type') === 'image/png' && bytes.length === PNG.length && bytes.every((byte, i) => byte === PNG[i]);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: SERVER, env: { ...process.env, ...env }, stdio: 'ignore' });

    child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))));
  });
}

/** The file-first read path: published entries only, drafts and broken files never served. */
async function contentChecks(label, base) {
  const response = await fetch(`${base}/api/content/field-notes`);
  const entries = await response.json();
  const [first] = entries;
  const marks = JSON.stringify(first?.data?.body ?? {});

  check(`${label}: file collections list only their published, valid entries`, response.ok && entries.length === 1 && first.slug === 'first-light', JSON.stringify(entries).slice(0, 300));
  check(`${label}: entries keep the legacy shape and a document body`, first?.id === 'field-notes/first-light' && first.status === 'published' && first.data.tags?.join() === 'dawn,hills' && marks.includes('"subscript"') && marks.includes('"Callout"'), JSON.stringify(first).slice(0, 300));
  check(`${label}: public reads are cacheable`, response.headers.get('cache-control') === 'public, max-age=60');
  check(`${label}: drafts and broken files are not found`, (await fetch(`${base}/api/content/field-notes/unfinished`)).status === 404 && (await fetch(`${base}/api/content/field-notes/no-title`)).status === 404);
}

async function startNode(dataDir, contentDir) {
  const child = spawn('node', ['.output-node/server/index.mjs'], {
    cwd: SERVER,
    env: { ...process.env, PORT: String(NODE_PORT), VENDA_DATA_DIR: dataDir, VENDA_CONTENT_DIR: contentDir, SESSION_SECRET: 'e2e-secret', ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password },
    stdio: 'ignore'
  });

  for (let i = 0; i < 60; i++) {
    if (await fetch(`${NODE}/api/health`).then(r => r.ok, () => false)) return child;

    await new Promise(r => setTimeout(r, 500));
  }

  child.kill();
  throw new Error('The Node server did not start');
}

await suite('server', async () => {
  await startApi();
  const health = await (await fetch(`${API}/api/health`)).json();

  check('Workers: health answers with the contract shape', health.ok === true && typeof health.version === 'string', JSON.stringify(health));
  check('Workers: media round-trips through R2 with its content type', await mediaRoundTrip(API, await signIn(API)));
  await contentChecks('Workers', API);

  await run('pnpm', ['exec', 'nitro', 'build'], { NITRO_PRESET: 'node' });
  const dataDir = await mkdtemp(join(tmpdir(), 'venda-node-'));
  const contentDir = await mkdtemp(join(tmpdir(), 'venda-content-'));

  await cp(CONTENT_FIXTURES, contentDir, { recursive: true });
  let node = await startNode(dataDir, contentDir);
  const cookie = await signIn(NODE);
  const created = await fetch(`${NODE}/api/collections`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Notes', slug: 'notes' }) });

  check('Node: migrations ran and the core works on SQLite', created.status === 201, String(created.status));
  check('Node: media round-trips through the filesystem with its content type', await mediaRoundTrip(NODE, cookie));
  check('Node: database collections still answer from the legacy core', (await fetch(`${NODE}/api/content/notes`)).status === 200);
  await contentChecks('Node', NODE);

  await writeFile(join(contentDir, 'field-notes/unfinished.md'), '---\ntitle: Finished after all\n---\n\nDone.\n');

  let edited = false;

  for (let i = 0; i < 20 && !edited; i++) {
    await new Promise(r => setTimeout(r, 250));
    edited = (await fetch(`${NODE}/api/content/field-notes/unfinished`)).ok;
  }

  check('Node: an edited file is live within seconds', edited);

  node.kill();
  await new Promise(r => node.once('exit', r));
  node = await startNode(dataDir, contentDir);
  const after = await (await fetch(`${NODE}/api/collections`, { headers: { Cookie: await signIn(NODE) } })).json();

  check('Node: data survives a restart and migrations are not re-applied', after.some(c => c.slug === 'notes'), JSON.stringify(after));
  node.kill();
});
