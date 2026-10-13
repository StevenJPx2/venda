// Write-path checks through the real Worker, D1 and KV.
import assert from 'node:assert/strict';
import {
  buildWorkers,
  check,
  client,
  contentFiles,
  saveBody,
  signedIn,
  startWorkers,
  suite,
  workersState
} from './support.mjs';

const entry = '/admin/collections/field-notes/entries/first-light';
const file = 'field-notes/first-light.md';

async function saveAndPublish(api, files) {
  const original = await files.read(file);
  const copy = (await api(`${entry}/copy`)).json;
  const saved = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(copy, 'Saved to a copy')
  );

  assert.equal(saved.status, 200, JSON.stringify(saved));
  check(
    'Workers: saving persists a working copy without changing the file',
    saved.json.dirty && (await files.read(file)) === original
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
      (await files.read(file)).includes('title: Saved to a copy') &&
      (await api('/content/field-notes/first-light')).json.data.title ===
        'Saved to a copy'
  );
}

async function conflictChecks(api, files) {
  const copy = (await api(`${entry}/copy`)).json;
  const saved = (await api(`${entry}/copy`, 'PUT', saveBody(copy, 'My change')))
    .json;
  const before = await files.read(file);

  await files.write(file, before.replace('Saved to a copy', 'Outside change'));

  const conflict = await api(`${entry}/publish`, 'POST', {
    revision: saved.revision
  });

  check(
    'Workers: a change made through the files API causes Conflict and is not overwritten',
    conflict.status === 409 &&
      conflict.json._tag === 'Conflict' &&
      (await files.read(file)).includes('Outside change')
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
  check(
    'Workers: the files API is for administrators and editors',
    (await author.api('/admin/files')).status === 403 &&
      (await contributor.api('/admin/import', 'POST', { files: [] })).status ===
        403
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

async function filesChecks(api, files) {
  const listed = (await api('/admin/files')).json;
  const current = listed.find(each => each.path === file);
  const stale = await api('/admin/files', 'POST', {
    message: 'From an old pull',
    changes: [
      {
        path: 'field-notes/new-one.md',
        text: '---\ntitle: New\n---\n\nHi.\n',
        baseSha: null
      },
      { path: file, text: 'stale', baseSha: '0'.repeat(40) }
    ]
  });

  check(
    'Workers: a write of several files with one stale SHA writes none of them',
    stale.status === 409 &&
      stale.json._tag === 'Conflict' &&
      stale.json.path === file &&
      !(await files.exists('field-notes/new-one.md'))
  );

  const both = await api('/admin/files', 'POST', {
    message: 'Two at once',
    changes: [
      {
        path: 'field-notes/new-one.md',
        text: '---\ntitle: New\n---\n\nHi.\n',
        baseSha: null
      },
      {
        path: file,
        text: (await files.read(file)).replace(/^title: .*$/m, 'title: Pushed'),
        baseSha: current.sha
      }
    ]
  });

  check(
    'Workers: a write of several files lands as one, and the index follows',
    both.status === 200 &&
      (await api('/content/field-notes/new-one')).status === 200 &&
      (await api('/content/field-notes/first-light')).json.data.title ===
        'Pushed'
  );
}

await suite('write path', async () => {
  const state = await workersState();

  await buildWorkers();

  let stop = await startWorkers(state);
  const api = await signedIn();
  const files = await contentFiles();

  await saveAndPublish(api, files);
  await conflictChecks(api, files);
  await revisionChecks(api);
  await sizeChecks(api);
  await roleChecks(api);
  await filesChecks(api, files);

  const copy = (await api(`${entry}/copy`)).json;
  const saved = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(copy, 'Survives a restart')
  );

  await stop();
  stop = await startWorkers(state);

  check(
    'Workers: copy revisions, fields and ownership survive a restart',
    (await api(`${entry}/copy`)).json.data.title === 'Survives a restart' &&
      saved.json.revision === (await api(`${entry}/copy`)).json.revision
  );

  const published = await api(`${entry}/publish`, 'POST', {
    revision: saved.json.revision
  });

  check(
    'Workers: the copy publishes after a restart',
    published.status === 200 &&
      (await files.read(file)).includes('title: Survives a restart')
  );
  await stop();
});
