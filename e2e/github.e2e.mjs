// The GitHub content store through the real Worker on local workerd: content
// read from a repository, publishing as commits with their attribution, an
// outside push that is never overwritten, and a GitHub outage while
// publishing. GitHub is the simulator in scripts/github-simulator.mjs.
import {
  buildWorkers,
  check,
  GITHUB_AUTHOR_EMAIL,
  saveBody,
  signedIn,
  startGitHubWorkers,
  suite,
  workersState
} from './support.mjs';

const entry = '/admin/collections/field-notes/entries/first-light';
const file = 'field-notes/first-light.md';

/** Saves the entry's copy with `title`; resolves to the saved copy. */
async function save(api, title) {
  const copy = (await api(`${entry}/copy`)).json;
  const saved = await api(`${entry}/copy`, 'PUT', saveBody(copy, title));

  if (saved.status !== 200) throw new Error(JSON.stringify(saved));

  return saved.json;
}

const publish = (api, copy) =>
  api(`${entry}/publish`, 'POST', { revision: copy.revision });

async function readChecks(api) {
  const entries = await api('/content/field-notes');

  check(
    'GitHub: the public API serves the repository content',
    entries.status === 200 &&
      entries.json.length === 1 &&
      entries.json[0].slug === 'first-light'
  );
}

async function publishChecks(api, github) {
  const me = (await api('/auth/me')).json;
  const published = await publish(api, await save(api, 'Published to GitHub'));
  const commit = github.state.commits.at(-1);

  check(
    'GitHub: Publish makes one commit with the file, its message and attribution',
    published.status === 200 &&
      github.file(file)?.includes('title: Published to GitHub') &&
      commit?.message === 'Publish field-notes/first-light' &&
      commit.author.name === `${me.name} via Venda` &&
      commit.author.email === GITHUB_AUTHOR_EMAIL,
    JSON.stringify({ status: published.status, commit, me: me.name })
  );
  check(
    'GitHub: the index takes the commit at once, without waiting for GitHub',
    (await api('/content/field-notes/first-light')).json.data.title ===
      'Published to GitHub'
  );
}

async function conflictChecks(api, github) {
  const mine = await save(api, 'Mine');

  github.push(
    file,
    github.file(file).replace('Published to GitHub', 'Pushed by an agent')
  );

  const conflict = await publish(api, mine);

  check(
    'GitHub: a push made meanwhile stops Publish with Conflict, and is kept',
    conflict.status === 409 &&
      conflict.json._tag === 'Conflict' &&
      github.file(file).includes('Pushed by an agent')
  );

  const copy = (await api(`${entry}/copy`)).json;

  check(
    'GitHub: the copy survives the conflict, marked changed outside Venda',
    copy.dirty && copy.changedOutside && copy.data.title === 'Mine'
  );
  check(
    'GitHub: the outside push reaches the index',
    (await api('/content/field-notes/first-light')).json.data.title ===
      'Pushed by an agent'
  );
}

async function outageChecks(api, github) {
  const copy = (await api(`${entry}/copy`)).json;
  const rebase = await api(`${entry}/copy/rebase`, 'POST', {
    revision: copy.revision,
    sha: copy.currentSha
  });

  if (rebase.status !== 200)
    throw new Error(
      `Rebase answered ${rebase.status}: ${JSON.stringify(rebase.json)}`
    );

  const rebased = rebase.json;
  const commits = github.state.commits.length;

  github.failWrites(502);

  const failed = await publish(api, rebased);
  const kept = (await api(`${entry}/copy`)).json;

  check(
    'GitHub: an outage while publishing fails the request and keeps the copy',
    failed.status >= 500 &&
      kept.dirty &&
      kept.data.title === 'Mine' &&
      github.state.commits.length === commits
  );

  const retried = await publish(api, kept);

  check(
    'GitHub: publishing again once GitHub is back makes the commit',
    retried.status === 200 &&
      github.file(file).includes('title: Mine') &&
      github.state.commits.length === commits + 1
  );
}

await suite('github', async () => {
  await buildWorkers();

  const { github } = await startGitHubWorkers(await workersState());
  const api = await signedIn();

  await readChecks(api);
  await publishChecks(api, github);
  await conflictChecks(api, github);
  await outageChecks(api, github);
});
