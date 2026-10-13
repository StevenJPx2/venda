// The GitHub store against real GitHub: the built Worker on local workerd,
// reading and publishing to the private throwaway repository set up by
// scripts/github-contract-setup.mjs, with real push webhooks through a
// cloudflared quick tunnel that lives only as long as this run.
//
//   pnpm contract:github
//
// Not part of `pnpm e2e`: it needs .venda-contract.json, the network and a
// few minutes. Every file it changes is put back, and the App's webhook URL
// is reset, when it ends.
import { execFile, spawn } from 'node:child_process';
import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  buildWorkers,
  check,
  OWNER,
  ROOT,
  saveBody,
  signedIn,
  start,
  suite,
  until,
  waitFor,
  WORKERS,
  workersState
} from './support.mjs';

const app = JSON.parse(await readFile(`${ROOT}/.venda-contract.json`, 'utf8'));
const RUN = Date.now().toString(36);
const AUTHOR_EMAIL = 'venda@users.noreply.venda.test';
const HELLO = 'content/journal/hello.md';
const PLACEHOLDER = 'https://venda-contract.invalid/api/webhooks/github';

const gh = async (...args) =>
  (await promisify(execFile)('gh', args, { maxBuffer: 16 * 1024 * 1024 }))
    .stdout;

const repoApi = (path, ...args) =>
  gh('api', `repos/${app.repository}/${path}`, ...args);

/** A file's text and SHA on the branch, or null. */
async function remote(path) {
  const json = await repoApi(`contents/${path}?ref=${app.branch}`).then(
    JSON.parse,
    () => null
  );

  return (
    json && {
      sha: json.sha,
      text: Buffer.from(json.content, 'base64').toString()
    }
  );
}

/** Commits `text` to `path` as someone outside Venda; null deletes it. */
async function outsidePush(path, text, message) {
  const current = await remote(path);
  const args = [
    '-X',
    text === null ? 'DELETE' : 'PUT',
    '-f',
    `message=${message}`
  ];

  if (current) args.push('-f', `sha=${current.sha}`);
  if (text !== null)
    args.push('-f', `content=${Buffer.from(text).toString('base64')}`);

  await repoApi(`contents/${path}`, ...args);
}

/** The App's own JWT, to point its webhook at this run's tunnel. */
function appJwt() {
  const part = value =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: app.clientId })}`;

  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), app.privateKey).toString('base64url')}`;
}

const pointWebhook = url =>
  fetch('https://api.github.com/app/hook/config', {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${appJwt()}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2026-03-10'
    },
    body: JSON.stringify({
      url,
      content_type: 'json',
      secret: app.webhookSecret
    })
  }).then(response => {
    if (!response.ok)
      throw new Error(`Webhook config answered ${response.status}`);
  });

/** A quick tunnel to the local Worker; resolves to its public address. */
function tunnel() {
  const child = spawn(
    'cloudflared',
    ['tunnel', '--no-autoupdate', '--url', WORKERS],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  );

  return new Promise((done, fail) => {
    const timer = setTimeout(
      () => fail(new Error('No tunnel within 60s')),
      60_000
    );

    child.stderr.on('data', data => {
      const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(
        String(data)
      )?.[0];

      if (url) {
        clearTimeout(timer);
        done({ url, stop: () => process.kill(-child.pid, 'SIGTERM') });
      }
    });
  });
}

async function startWorker() {
  const env = {
    VENDA_OWNER_EMAIL: OWNER.email,
    VENDA_OWNER_PASSWORD: OWNER.password,
    VENDA_GITHUB_REPOSITORY: app.repository,
    VENDA_GITHUB_REPOSITORY_ID: String(app.repositoryId),
    VENDA_GITHUB_BRANCH: app.branch,
    VENDA_GITHUB_CLIENT_ID: app.clientId,
    VENDA_GITHUB_INSTALLATION_ID: String(app.installationId),
    VENDA_GITHUB_PRIVATE_KEY: app.privateKey,
    VENDA_GITHUB_WEBHOOK_SECRET: app.webhookSecret,
    VENDA_GITHUB_AUTHOR_EMAIL: AUTHOR_EMAIL
  };

  start('workers', 'npx', [
    'wrangler',
    'dev',
    '--local',
    '--test-scheduled',
    '--persist-to',
    await workersState(),
    '--config',
    '.output/server/wrangler.json',
    '--port',
    '8795',
    ...Object.entries(env).flatMap(([key, value]) => [
      '--var',
      `${key}:${value}`
    ])
  ]);
  await waitFor(`${WORKERS}/api/health`, 'Workers');
}

const entry = '/admin/collections/journal/entries/hello';

const title = (api, expected, seconds = 60) =>
  until(
    () => api('/content/journal/hello'),
    read => read.json?.data?.title === expected,
    seconds
  ).then(read => read.json?.data?.title);

async function save(api, text, path = entry) {
  const copy = (await api(`${path}/copy`)).json;

  return (await api(`${path}/copy`, 'PUT', saveBody(copy, text))).json;
}

async function publishChecks(api) {
  const me = (await api('/auth/me')).json;
  const text = `Published by the contract run ${RUN}`;
  const published = await api(`${entry}/publish`, 'POST', {
    revision: (await save(api, text)).revision
  });
  const [commit] = JSON.parse(
    await repoApi(`commits?path=${HELLO}&per_page=1`)
  );

  check(
    'GitHub (real): Publish commits to the repository, credited to the editor',
    published.status === 200 &&
      (await remote(HELLO))?.text.includes(text) &&
      commit?.commit.message === 'Publish journal/hello' &&
      commit.commit.author.name === `${me.name} via Venda` &&
      commit.commit.author.email === AUTHOR_EMAIL,
    JSON.stringify({ status: published.status, author: commit?.commit.author })
  );
}

async function outsideChecks(api) {
  const mine = await save(api, `Mine ${RUN}`);
  const theirs = `Pushed outside Venda ${RUN}`;
  const before = await remote(HELLO);

  await outsidePush(
    HELLO,
    before.text.replace(/^title: .*$/m, `title: ${theirs}`),
    'Outside edit (contract test)'
  );

  const conflict = await api(`${entry}/publish`, 'POST', {
    revision: mine.revision
  });

  check(
    'GitHub (real): a push made meanwhile stops Publish with Conflict',
    conflict.status === 409 && (await remote(HELLO)).text.includes(theirs)
  );
  check(
    "GitHub (real): the push's webhook, through the tunnel, brings it into the index",
    (await title(api, theirs)) === theirs
  );
}

async function racingChecks(api) {
  const slug = `race-${RUN}`;
  const created = await api('/admin/collections/journal/entries', 'POST', {
    slug,
    data: {
      title: `Racing ${RUN}`,
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hi.' }] }
        ]
      }
    }
  });
  const copy = (await api(`${entry}/copy`)).json;
  const rebased = await api(`${entry}/copy/rebase`, 'POST', {
    revision: copy.revision,
    sha: copy.currentSha
  });
  const mine = await api(
    `${entry}/copy`,
    'PUT',
    saveBody(rebased.json, `Racing too ${RUN}`)
  );
  const both = await Promise.all([
    api(`${entry}/publish`, 'POST', { revision: mine.json.revision }),
    api(`/admin/collections/journal/entries/${slug}/publish`, 'POST', {
      revision: created.json.revision
    })
  ]);

  check(
    'GitHub (real): two entries published at once both commit',
    both.every(answer => answer.status === 200) &&
      (await remote(`content/journal/${slug}.md`)) !== null &&
      (await remote(HELLO)).text.includes(`Racing too ${RUN}`),
    JSON.stringify(both.map(answer => [answer.status, answer.json?._tag]))
  );

  return `content/journal/${slug}.md`;
}

await suite('github contract', async () => {
  const original = await remote(HELLO);
  const created = [];
  const { url, stop: stopTunnel } = await tunnel();

  try {
    await buildWorkers();
    await startWorker();
    await pointWebhook(`${url}/api/webhooks/github`);

    const api = await signedIn();

    check(
      'GitHub (real): the public API serves the repository content',
      typeof (await title(api, original.text.match(/^title: (.*)$/m)?.[1])) ===
        'string'
    );
    await publishChecks(api);
    await outsideChecks(api);
    created.push(await racingChecks(api));
  } finally {
    await pointWebhook(PLACEHOLDER).catch(error => console.error(error));
    stopTunnel();

    for (const path of created)
      await outsidePush(path, null, `Remove ${path} (contract test)`).catch(
        () => {}
      );

    if ((await remote(HELLO))?.text !== original.text)
      await outsidePush(
        HELLO,
        original.text,
        'Restore hello.md (contract test)'
      );
  }
});
