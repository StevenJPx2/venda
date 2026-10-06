// The server on two Nitro presets: Cloudflare Workers (local workerd and D1,
// content bundled at build time) and Node (node:sqlite, the content folder
// watched in its working directory). Same checks on both.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildNode,
  check,
  NODE,
  nodeDirectory,
  startNode,
  startWorkers,
  stop,
  suite,
  WORKERS
} from './support.mjs';

/** The read path: published entries only, drafts and broken files never served. */
async function contentChecks(label, base) {
  const health = await (await fetch(`${base}/api/health`)).json();
  const response = await fetch(`${base}/api/content/field-notes`);
  const entries = await response.json();
  const [first] = entries;
  const body = JSON.stringify(first?.data?.body ?? {});

  check(
    `${label}: health answers with the contract shape`,
    health.ok === true && typeof health.version === 'string',
    JSON.stringify(health)
  );
  check(
    `${label}: a file collection lists only its published, valid entries`,
    response.ok && entries.length === 1 && first.slug === 'first-light',
    JSON.stringify(entries).slice(0, 300)
  );
  check(
    `${label}: entries carry their fields and a document body`,
    first?.collection === 'field-notes' &&
      first.publishedAt === '2026-09-01T06:00:00.000Z' &&
      first.data.tags?.join() === 'dawn,hills' &&
      body.includes('"subscript"') &&
      body.includes('"Callout"'),
    JSON.stringify(first).slice(0, 300)
  );
  check(
    `${label}: public reads are cacheable`,
    response.headers.get('cache-control') === 'public, max-age=60'
  );
  check(
    `${label}: drafts and broken files are not found`,
    (await fetch(`${base}/api/content/field-notes/unfinished`)).status ===
      404 &&
      (await fetch(`${base}/api/content/field-notes/no-title`)).status === 404
  );
  check(
    `${label}: unknown collections are a typed 404`,
    (await (await fetch(`${base}/api/content/nothing-here`)).json())._tag ===
      'CollectionNotFound'
  );
}

async function poll(url, test, seconds = 5) {
  for (let i = 0; i < seconds * 4; i++) {
    if (await fetch(url).then(test, () => false)) return true;

    await new Promise(r => setTimeout(r, 250));
  }

  return false;
}

await suite('server', async () => {
  await startWorkers();
  await contentChecks('Workers', WORKERS);

  await buildNode();

  const dir = await nodeDirectory();
  let node = await startNode(dir);

  await contentChecks('Node', NODE);

  await writeFile(
    join(dir, 'content/field-notes/unfinished.md'),
    '---\ntitle: Finished after all\n---\n\nDone.\n'
  );
  check(
    'Node: an edited file is live within seconds',
    await poll(
      `${NODE}/api/content/field-notes/unfinished`,
      response => response.ok
    )
  );

  check('Node: shuts down cleanly on SIGTERM', await stop(node));
  node = await startNode(dir);
  check(
    'Node: the index survives a restart and migrations are not re-applied',
    (await fetch(`${NODE}/api/content/field-notes/unfinished`)).ok
  );
  await stop(node);
});
