// The server on local workerd and D1, with the fixture content imported:
// the read path, the content surviving a restart, and a file written through
// the files API served by the next request.
import {
  buildWorkers,
  check,
  contentFiles,
  startWorkers,
  suite,
  WORKERS,
  workersState
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

await suite('server', async () => {
  const state = await workersState();

  await buildWorkers();

  let stopWorkers = await startWorkers(state);

  await contentChecks('Workers', WORKERS);
  await stopWorkers();

  // The same database again: the content is kept, and migrations already
  // applied do not run twice.
  stopWorkers = await startWorkers(state);
  await contentChecks('Workers, restarted', WORKERS);

  const files = await contentFiles();

  await files.write(
    'field-notes/unfinished.md',
    '---\ntitle: Finished after all\n---\n\nDone.\n'
  );
  check(
    'Workers: a file written through the files API is served by the next request',
    (await fetch(`${WORKERS}/api/content/field-notes/unfinished`)).ok
  );
  await stopWorkers();
});
