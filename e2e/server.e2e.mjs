// The server on two Nitro presets: Cloudflare Workers (local workerd and D1,
// content bundled at build time) and Node (node:sqlite, the content folder
// watched in its working directory). Same checks on both.
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT_FIXTURES, ROOT, check, run, start, stop, suite, waitFor } from './support.mjs';

const WORKERS = 'http://localhost:8795';
const NODE = 'http://localhost:8797';

/** The read path: published entries only, drafts and broken files never served. */
async function contentChecks(label, base) {
  const health = await (await fetch(`${base}/api/health`)).json();
  const response = await fetch(`${base}/api/content/field-notes`);
  const entries = await response.json();
  const [first] = entries;
  const body = JSON.stringify(first?.data?.body ?? {});

  check(`${label}: health answers with the contract shape`, health.ok === true && typeof health.version === 'string', JSON.stringify(health));
  check(`${label}: a file collection lists only its published, valid entries`, response.ok && entries.length === 1 && first.slug === 'first-light', JSON.stringify(entries).slice(0, 300));
  check(`${label}: entries carry their fields and a document body`, first?.collection === 'field-notes' && first.publishedAt === '2026-09-01T06:00:00.000Z' && first.data.tags?.join() === 'dawn,hills' && body.includes('"subscript"') && body.includes('"Callout"'), JSON.stringify(first).slice(0, 300));
  check(`${label}: public reads are cacheable`, response.headers.get('cache-control') === 'public, max-age=60');
  check(`${label}: drafts and broken files are not found`, (await fetch(`${base}/api/content/field-notes/unfinished`)).status === 404 && (await fetch(`${base}/api/content/field-notes/no-title`)).status === 404);
  check(`${label}: unknown collections are a typed 404`, (await (await fetch(`${base}/api/content/nothing-here`)).json())._tag === 'CollectionNotFound');
}

async function poll(url, test, seconds = 5) {
  for (let i = 0; i < seconds * 4; i++) {
    if (await fetch(url).then(test, () => false)) return true;

    await new Promise(r => setTimeout(r, 250));
  }

  return false;
}

const startNode = dir => start('node', 'node', [join(ROOT, 'packages/server/.output-node/server/index.mjs')], { cwd: dir, env: { PORT: '8797' } });

await suite('server', async () => {
  await run('pnpm', ['exec', 'nitro', 'build'], { VENDA_CONTENT_DIR: CONTENT_FIXTURES });

  const state = await mkdtemp(join(tmpdir(), 'venda-e2e-'));

  start('workers', 'npx', ['wrangler', 'dev', '--local', '--persist-to', state, '--config', '.output/server/wrangler.json', '--port', '8795']);
  await waitFor(`${WORKERS}/api/health`, 'Workers');
  await contentChecks('Workers', WORKERS);

  await run('pnpm', ['exec', 'nitro', 'build'], { NITRO_PRESET: 'node' });

  const dir = await mkdtemp(join(tmpdir(), 'venda-node-'));

  await cp(CONTENT_FIXTURES, join(dir, 'content'), { recursive: true });

  let node = startNode(dir);

  await waitFor(`${NODE}/api/health`, 'Node');
  await contentChecks('Node', NODE);

  await writeFile(join(dir, 'content/field-notes/unfinished.md'), '---\ntitle: Finished after all\n---\n\nDone.\n');
  check('Node: an edited file is live within seconds', await poll(`${NODE}/api/content/field-notes/unfinished`, response => response.ok));

  check('Node: shuts down cleanly on SIGTERM', await stop(node));
  node = startNode(dir);
  await waitFor(`${NODE}/api/health`, 'Node');
  check('Node: the index survives a restart and migrations are not re-applied', (await fetch(`${NODE}/api/content/field-notes/unfinished`)).ok);
  await stop(node);
});
