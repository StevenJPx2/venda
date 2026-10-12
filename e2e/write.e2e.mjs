// Write-path checks through the real Worker, D1, KV and the local folder server.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildWorkers,
  check,
  liveContent,
  OWNER,
  startWorkers,
  suite,
  WORKERS,
  workersState
} from './support.mjs';

const entry = '/admin/collections/field-notes/entries/first-light';
const file = 'field-notes/first-light.md';

function client() {
  let cookie = '';

  return async (path, method = 'GET', body, origin) => {
    const response = await fetch(`${WORKERS}/api${path}`, {
      method,
      headers: {
        cookie,
        'content-type': 'application/json',
        ...(origin ? { origin } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const session = response.headers
      .getSetCookie()
      .find(value => value.startsWith('venda_session='));

    if (session) cookie = session.split(';')[0];

    return { status: response.status, json: await response.json() };
  };
}

async function signedIn() {
  const api = client();

  assert.equal((await api('/auth/sign-in', 'POST', OWNER)).status, 200);

  return api;
}

const saveBody = (copy, title) => ({
  revision: copy.revision,
  data: { ...copy.data, title },
  publishedAt: copy.publishedAt
});

async function saveAndPublish(api, live) {
  const original = await readFile(join(live, file), 'utf8');
  const copy = (await api(`${entry}/copy`)).json;
  const saved = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(copy, 'Saved to a copy')
  );

  assert.equal(saved.status, 200, JSON.stringify(saved));
  check(
    'Workers: saving persists a working copy without changing the file',
    saved.json.dirty && (await readFile(join(live, file), 'utf8')) === original
  );
  check(
    'Workers: the public API still serves the file while its copy is edited',
    (await api('/content/field-notes/first-light')).json.data.title ===
      'First light'
  );

  const stale = await api(`${entry}/copy`, 'PUT', saveBody(copy, 'Stale tab'));

  check(
    'Workers: a stale revision is a typed 409',
    stale.status === 409 && stale.json._tag === 'EditedElsewhere'
  );

  const published = await api(`${entry}/publish`, 'POST', {
    revision: saved.json.revision
  });

  assert.equal(published.status, 200, JSON.stringify(published));
  check(
    'Workers: publishing writes Markdown and updates the index immediately',
    !published.json.dirty &&
      (await readFile(join(live, file), 'utf8')).includes(
        'title: Saved to a copy'
      ) &&
      (await api('/content/field-notes/first-light')).json.data.title ===
        'Saved to a copy'
  );
}

async function conflictChecks(api, live) {
  const copy = (await api(`${entry}/copy`)).json;
  const saved = (await api(`${entry}/copy`, 'PUT', saveBody(copy, 'My change')))
    .json;
  const before = await readFile(join(live, file), 'utf8');

  await writeFile(
    join(live, file),
    before.replace('Saved to a copy', 'Outside change')
  );

  const conflict = await api(`${entry}/publish`, 'POST', {
    revision: saved.revision
  });

  check(
    'Workers: a disk edit causes Conflict and is not overwritten',
    conflict.status === 409 &&
      conflict.json._tag === 'Conflict' &&
      (await readFile(join(live, file), 'utf8')).includes('Outside change')
  );

  const current = (await api(`${entry}/copy`)).json;

  check(
    'Workers: the conflicted copy keeps its fields and flags the outside change',
    current.dirty &&
      current.changedOutside &&
      current.data.title === 'My change'
  );

  const rebase = await api(`${entry}/copy/rebase`, 'POST', {
    revision: current.revision,
    sha: current.currentSha
  });
  const published = await api(`${entry}/publish`, 'POST', {
    revision: rebase.json.revision
  });

  assert.equal(published.status, 200, JSON.stringify(published));
  check(
    'Workers: explicitly acknowledging the outside SHA permits publication',
    (await api('/content/field-notes/first-light')).json.data.title ===
      'My change'
  );
}

async function revisionChecks(api) {
  const copy = (await api(`${entry}/copy`)).json;
  const results = await Promise.all([
    api(`${entry}/copy`, 'PUT', saveBody(copy, 'One')),
    api(`${entry}/copy`, 'PUT', saveBody(copy, 'Two'))
  ]);

  check(
    'Workers: concurrent saves at one revision have exactly one winner',
    results
      .map(result => result.status)
      .sort()
      .join(',') === '200,409'
  );

  const current = (await api(`${entry}/copy`)).json;
  const discarded = await api(`${entry}/copy`, 'DELETE', {
    revision: current.revision
  });

  assert.equal(discarded.status, 200, JSON.stringify(discarded));
  check(
    'Workers: discard restores the file and never resets the revision',
    !discarded.json.dirty &&
      discarded.json.data.title === 'My change' &&
      discarded.json.revision > current.revision
  );
  check(
    'Workers: another Origin cannot write a copy',
    (
      await api(
        `${entry}/copy`,
        'PUT',
        saveBody(discarded.json, 'Cross-site'),
        'https://evil.example'
      )
    ).status === 403
  );
  check(
    'Workers: malformed documents are rejected before Markdown serialization',
    (
      await api(`${entry}/copy`, 'PUT', {
        ...saveBody(discarded.json, 'Bad doc'),
        data: { body: { type: 'bad' } }
      })
    ).status === 400
  );
}

async function addPerson(api, role) {
  const person = client();
  const email = `${role}@venda.test`;
  const invited = await api('/invitations', 'POST', { email, role });

  assert.equal(invited.status, 200);
  assert.equal(
    (
      await person(`/join/${invited.json.token}`, 'POST', {
        name: role,
        password: 'long-enough-password'
      })
    ).status,
    200
  );
  await person('/auth/sign-in', 'POST', {
    email,
    password: 'long-enough-password'
  });

  return { api: person, id: (await person('/auth/me')).json.id };
}

async function sizeChecks(api) {
  const copy = (await api(`${entry}/copy`)).json;
  const rejected = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(copy, 'x'.repeat(1_048_577))
  );

  check(
    'Workers: entry writes are bounded at 1 MB without changing the copy',
    rejected.status === 413 &&
      rejected.json._tag === 'ContentTooLarge' &&
      (await api(`${entry}/copy`)).json.revision === copy.revision
  );
}

async function roleChecks(api) {
  const contributor = await addPerson(api, 'contributor');
  const author = await addPerson(api, 'author');

  check(
    'Workers: authors cannot edit unowned repository entries',
    (await author.api(`${entry}/copy`)).status === 403
  );

  const copy = (await api(`${entry}/copy`)).json;
  const owned = await api(`${entry}/owner`, 'PUT', {
    revision: copy.revision,
    ownerId: contributor.id
  });
  const saved = await contributor.api(
    `${entry}/copy`,
    'PUT',
    saveBody(owned.json, 'Needs review')
  );

  assert.equal(saved.status, 200, JSON.stringify(saved));
  check(
    'Workers: contributors can save their own entry but cannot publish or assign owners',
    (
      await contributor.api(`${entry}/publish`, 'POST', {
        revision: saved.json.revision
      })
    ).status === 403 &&
      (
        await contributor.api(`${entry}/owner`, 'PUT', {
          revision: saved.json.revision,
          ownerId: author.id
        })
      ).status === 403
  );
  check(
    'Workers: another author cannot read an owned copy',
    (await author.api(`${entry}/copy`)).status === 403
  );

  const reassigned = await api(`${entry}/owner`, 'PUT', {
    revision: saved.json.revision,
    ownerId: author.id
  });
  const published = await author.api(`${entry}/publish`, 'POST', {
    revision: reassigned.json.revision
  });

  check(
    'Workers: an author can publish an entry assigned to them',
    published.status === 200
  );
}

await suite('write path', async () => {
  const state = await workersState();
  const live = await liveContent();

  await buildWorkers();

  let stop = await startWorkers(state, live);
  const api = await signedIn();

  await saveAndPublish(api, live);
  await conflictChecks(api, live);
  await revisionChecks(api);
  await sizeChecks(api);
  await roleChecks(api);

  const copy = (await api(`${entry}/copy`)).json;
  const saved = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(copy, 'Survives a restart')
  );

  await stop();
  stop = await startWorkers(state, live);

  check(
    'Workers: copy revisions, fields and ownership survive a restart',
    (await api(`${entry}/copy`)).json.data.title === 'Survives a restart' &&
      saved.json.revision === (await api(`${entry}/copy`)).json.revision
  );

  await stop();
  stop = await startWorkers(state);

  const bundled = await api(`${entry}/publish`, 'POST', {
    revision: saved.json.revision
  });

  check(
    'Workers: the bundled store refuses publish with a typed read-only reason',
    bundled.status === 409 && bundled.json._tag === 'ContentReadOnly'
  );
  await stop();
});
