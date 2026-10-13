// One-time setup for the real GitHub contract test (`pnpm contract:github`):
// a private repository with a little content, and a private GitHub App
// installed only on it. GitHub creates Apps only in a browser, so this serves
// a page on localhost that sends GitHub a prefilled App; you click Create,
// then Install. The App's IDs, key and webhook secret are written to
// .venda-contract.json, which git ignores.
//
//   node scripts/github-contract-setup.mjs
import { execFile } from 'node:child_process';
import { createPrivateKey, randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, '.venda-contract.json');
const OWNER = 'StevenJPx2';
const REPO = 'venda-contract-test';
const PORT = 8798;
const HERE = `http://localhost:${PORT}`;

const run = promisify(execFile);

const gh = async (...args) => (await run('gh', args)).stdout;

const SEED = new Map([
  [
    'content/journal/config.ts',
    "import { defineCollection } from 'venda';\n\nexport default defineCollection({\n  name: 'Journal',\n  kind: 'posts',\n  fields: {\n    title: { type: 'text', required: true },\n    body: { type: 'richtext' }\n  }\n});\n"
  ],
  [
    'content/journal/hello.md',
    '---\ntitle: Hello from the contract test\npublishedAt: 2026-10-13T00:00:00Z\n---\n\nThe contract test edits this repository; nothing here matters.\n'
  ]
]);

/** The private repository, created once, with the seed content. */
async function ensureRepository() {
  const exists = await gh(
    'repo',
    'view',
    `${OWNER}/${REPO}`,
    '--json',
    'id'
  ).then(
    () => true,
    () => false
  );

  if (!exists)
    await gh(
      'repo',
      'create',
      `${OWNER}/${REPO}`,
      '--private',
      '--add-readme',
      '--description',
      "Throwaway repository for Venda's GitHub contract test"
    );

  for (const [path, text] of SEED) {
    const present = await gh(
      'api',
      `repos/${OWNER}/${REPO}/contents/${path}`
    ).then(
      () => true,
      () => false
    );

    if (!present)
      await gh(
        'api',
        '-X',
        'PUT',
        `repos/${OWNER}/${REPO}/contents/${path}`,
        '-f',
        `message=Seed ${path}`,
        '-f',
        `content=${Buffer.from(text).toString('base64')}`
      );
  }

  return Number(await gh('api', `repos/${OWNER}/${REPO}`, '--jq', '.id'));
}

const MANIFEST = {
  name: `venda-contract-${OWNER.toLowerCase()}`,
  url: 'https://github.com/StevenJPx2/venda',
  description:
    "Venda's GitHub contract test. Installed on one throwaway repository.",
  // The test points the webhook at a quick tunnel for each run.
  hook_attributes: {
    url: 'https://venda-contract.invalid/api/webhooks/github',
    active: true
  },
  // GitHub appends `code` and the form's `state` itself.
  redirect_url: `${HERE}/created`,
  setup_url: `${HERE}/installed`,
  public: false,
  default_permissions: { contents: 'write', metadata: 'read' },
  default_events: ['push']
};

const page = state => `<!doctype html><meta charset="utf-8">
<title>Create the Venda contract-test App</title>
<body style="font: 16px system-ui; max-width: 40rem; margin: 4rem auto">
<h1>Create the contract-test App</h1>
<p>GitHub shows the App prefilled: private, contents read and write, push
events, owned by ${OWNER}. Press <b>Create GitHub App</b>, then install it on
<b>${OWNER}/${REPO}</b> only.</p>
<form action="https://github.com/settings/apps/new?state=${state}" method="post">
<input type="hidden" name="manifest" value='${JSON.stringify(MANIFEST).replaceAll("'", '&#39;')}'>
<button style="font: inherit; padding: .6rem 1rem">Continue to GitHub</button>
</form></body>`;

/** Serves the page, collects the App, then its installation. */
function collect(state, repositoryId) {
  let app;

  return new Promise((done, fail) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', HERE);

      try {
        if (url.pathname === '/')
          return response
            .writeHead(200, { 'content-type': 'text/html' })
            .end(page(state));

        if (url.pathname === '/created') {
          if (url.searchParams.get('state') !== state)
            throw new Error('State did not match');

          app = JSON.parse(
            await gh(
              'api',
              '-X',
              'POST',
              `app-manifests/${url.searchParams.get('code')}/conversions`
            )
          );

          return response
            .writeHead(302, {
              location: `https://github.com/apps/${app.slug}/installations/new`
            })
            .end();
        }

        if (url.pathname === '/installed' && app) {
          response
            .writeHead(200, { 'content-type': 'text/html' })
            .end(
              '<p style="font: 16px system-ui">Done. You can close this tab.</p>'
            );
          server.close();
          done({
            app,
            installationId: Number(url.searchParams.get('installation_id')),
            repositoryId
          });

          return;
        }

        response.writeHead(404).end();
      } catch (error) {
        response.writeHead(500).end(String(error));
        server.close();
        fail(error);
      }
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Open ${HERE} and follow the two steps on GitHub.`);
      void run('open', [HERE]).catch(() => {});
    });
  });
}

if (
  await access(OUT).then(
    () => true,
    () => false
  )
) {
  console.log(`${OUT} exists already; delete it to set up a new App.`);
  process.exit(0);
}

const repositoryId = await ensureRepository();
const { app, installationId } = await collect(randomUUID(), repositoryId);

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      repository: `${OWNER}/${REPO}`,
      repositoryId,
      branch: 'main',
      appId: app.id,
      appSlug: app.slug,
      clientId: app.client_id,
      installationId,
      webhookSecret: app.webhook_secret,
      // GitHub hands out PKCS#1; Venda reads PKCS#8.
      privateKey: createPrivateKey(app.pem).export({
        type: 'pkcs8',
        format: 'pem'
      })
    },
    null,
    2
  )}\n`,
  { mode: 0o600 }
);
console.log(
  `Saved the App ${app.slug} (installation ${installationId}) to ${OUT}.`
);
