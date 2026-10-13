// The GitHub content store through the real Worker on local workerd: content
// read from a repository, publishing as commits with their attribution, an
// outside push that is never overwritten, and a GitHub outage while
// publishing. GitHub is the simulator in scripts/github-simulator.mjs.
import { createHmac } from 'node:crypto';
import {
  buildWorkers,
  check,
  GITHUB_AUTHOR_EMAIL,
  saveBody,
  signedIn,
  startGitHubWorkers,
  suite,
  until,
  WORKERS,
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

  // Held, so Publish meets the push before its webhook re-indexes it.
  github.hold();
  await github.push(
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
  await github.release();
  check(
    "GitHub: the push's webhook brings it into the index",
    (await title(api, 'first-light', 'Pushed by an agent')) ===
      'Pushed by an agent'
  );
}

/** The public title of an entry, once it reads `expected` or ten seconds pass. */
const title = async (api, slug, expected) =>
  (
    await until(
      () => api(`/content/field-notes/${slug}`),
      read => read.json?.data?.title === expected
    )
  ).json?.data?.title;

/** Pushes `text` as first-light's title, as someone outside Venda would. */
const pushTitle = (github, text) =>
  github.push(
    file,
    github.file(file).replace(/^title: .*$/m, `title: ${text}`),
    `Retitle to ${text}`
  );

async function webhookChecks(api, github, secret) {
  const forged = await fetch(`${WORKERS}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'x-github-event': 'push',
      'x-hub-signature-256': `sha256=${'0'.repeat(64)}`
    },
    body: JSON.stringify({ ref: 'refs/heads/main', repository: { id: 42 } })
  });
  const body = JSON.stringify({ zen: 'Keep it logically awesome.' });
  const ping = await fetch(`${WORKERS}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'x-github-event': 'ping',
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    },
    body
  });

  check(
    'GitHub: a delivery without the secret is refused; a signed ping is acknowledged',
    forged.status === 401 && ping.status === 202
  );

  // Two pushes whose webhooks arrive newest first, each twice.
  github.hold();
  await pushTitle(github, 'Second to last');
  await pushTitle(github, 'Newest');
  await github.release({ reverse: true, twice: true });
  check(
    'GitHub: webhooks late, repeated and out of order still leave the newest commit indexed',
    (await title(api, 'first-light', 'Newest')) === 'Newest' &&
      github.state.deliveries.slice(-4).every(each => each.status === 202)
  );
}

async function missedChecks(api, github, tick, secret) {
  github.deliverTo(null);
  await pushTitle(github, 'Pushed while webhooks were down');
  await tick();
  github.deliverTo(`${WORKERS}/api/webhooks/github`, secret);
  check(
    'GitHub: the minute check indexes a push whose webhook never came',
    (await title(api, 'first-light', 'Pushed while webhooks were down')) ===
      'Pushed while webhooks were down'
  );
}

const body = text => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

/** A second entry, saved and ready to publish. */
async function secondEntry(api) {
  const created = await api('/admin/collections/field-notes/entries', 'POST', {
    slug: 'second-light',
    data: { title: 'Second light', body: body('Later that day.') }
  });

  if (created.status !== 200) throw new Error(JSON.stringify(created));

  return created.json;
}

async function racingChecks(api, github) {
  const other = await secondEntry(api);
  const mine = await save(api, 'Racing the other publish');
  const commits = github.state.commits.length;
  const both = await Promise.all([
    publish(api, mine),
    api('/admin/collections/field-notes/entries/second-light/publish', 'POST', {
      revision: other.revision
    })
  ]);

  check(
    'GitHub: two people publishing different entries at once both commit',
    both.every(answer => answer.status === 200) &&
      github.state.commits.length === commits + 2 &&
      github.file('field-notes/second-light.md')?.includes('Second light'),
    JSON.stringify(both.map(answer => answer.status))
  );

  const again = await save(api, 'Pressed twice');
  const before = github.state.commits.length;
  const twice = await Promise.all([publish(api, again), publish(api, again)]);

  check(
    'GitHub: one entry published from two tabs at once makes exactly one commit',
    twice.some(answer => answer.status === 200) &&
      github.state.commits.length === before + 1 &&
      github.file(file).includes('title: Pressed twice'),
    JSON.stringify(twice.map(answer => [answer.status, answer.json?._tag]))
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

  const { github, tick, webhookSecret } = await startGitHubWorkers(
    await workersState()
  );
  const api = await signedIn();

  await readChecks(api);
  await publishChecks(api, github);
  await conflictChecks(api, github);
  await outageChecks(api, github);
  await webhookChecks(api, github, webhookSecret);
  await missedChecks(api, github, tick, webhookSecret);
  await racingChecks(api, github);
});
