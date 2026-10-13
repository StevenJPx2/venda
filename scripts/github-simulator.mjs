// A small stand-in for the GitHub REST API, for tests and `pnpm try`: one
// repository, one App installation, the endpoints Venda's GitHub store uses,
// answering as GitHub does (conditional writes, 409 and 422, truncated trees).
// It checks the App's RS256 JWT and the installation token like GitHub would.
// Local only: it listens on 127.0.0.1.
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  verify
} from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';

const sha1 = text => createHash('sha1').update(text).digest('hex');

const blobSha = bytes =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');

/** Git objects for the files as they are now: blobs, nested trees, a commit. */
function snapshot(files, objects, parent) {
  const root = new Map();

  for (const [path, text] of files) {
    const parts = path.split('/');
    let dir = root;

    for (const part of parts.slice(0, -1)) {
      if (!dir.has(part)) dir.set(part, new Map());

      dir = dir.get(part);
    }

    const bytes = Buffer.from(text);
    const sha = blobSha(bytes);

    objects.blobs.set(sha, bytes);
    dir.set(parts.at(-1), { sha, size: bytes.length });
  }

  const treeOf = dir => {
    const entries = [...dir].map(([name, value]) =>
      value instanceof Map
        ? { path: name, mode: '040000', type: 'tree', sha: treeOf(value) }
        : {
            path: name,
            mode: '100644',
            type: 'blob',
            sha: value.sha,
            size: value.size
          }
    );
    const sha = sha1(`tree ${JSON.stringify(entries)}`);

    objects.trees.set(sha, entries);

    return sha;
  };
  const tree = treeOf(root);
  const commit = sha1(`commit ${tree} ${parent ?? ''} ${randomUUID()}`);

  objects.commits.set(commit, { tree, parent });

  return commit;
}

function flatten(objects, sha, base = '') {
  return (objects.trees.get(sha) ?? []).flatMap(entry => {
    const path = base + entry.path;

    return entry.type === 'tree'
      ? [{ ...entry, path }, ...flatten(objects, entry.sha, `${path}/`)]
      : [{ ...entry, path }];
  });
}

/** The App's JWT: RS256 by its key, issued by its client ID, still valid. */
function validJwt(token, publicKey, clientId) {
  const [header, claims, signature] = token.split('.');

  if (!header || !claims || !signature) return false;

  const signed = verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${claims}`),
    publicKey,
    Buffer.from(signature, 'base64url')
  );
  const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
  const now = Date.now() / 1000;

  return (
    signed &&
    body.iss === clientId &&
    body.iat <= now + 60 &&
    body.exp > now &&
    body.exp - body.iat <= 600
  );
}

const json = (response, status, body) =>
  response
    .writeHead(status, { 'content-type': 'application/json' })
    .end(body === undefined ? '' : JSON.stringify(body));

async function bodyOf(request) {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

/** Creates or replaces a file the way the Contents API does. */
function putFile(state, path, body, response) {
  const current = state.files.get(path);
  const currentSha =
    current === undefined ? null : blobSha(Buffer.from(current));

  if (body.branch !== state.branch)
    return json(response, 404, { message: 'Branch not found' });
  if (currentSha !== null && !body.sha)
    return json(response, 422, {
      message: `Invalid request. "sha" wasn't supplied.`
    });
  if (body.sha && body.sha !== currentSha)
    return json(response, 409, {
      message: `${path} does not match ${body.sha}`
    });

  const text = Buffer.from(body.content, 'base64').toString();

  state.commit(path, text, { message: body.message, author: body.author });

  return json(response, currentSha === null ? 201 : 200, {
    content: { path, sha: blobSha(Buffer.from(text)) },
    commit: { sha: state.head }
  });
}

function getFile(state, path, url, response) {
  const text = state.files.get(path);

  if (url.searchParams.get('ref') !== state.branch || text === undefined)
    return json(response, 404, { message: 'Not Found' });

  const bytes = Buffer.from(text);

  return json(response, 200, {
    type: 'file',
    path,
    sha: blobSha(bytes),
    size: bytes.length,
    encoding: 'base64',
    content: bytes.toString('base64')
  });
}

function gitObject(state, kind, sha, url, response) {
  const { objects } = state;

  if (kind === 'ref')
    return sha === `heads/${state.branch}`
      ? json(response, 200, { object: { sha: state.head, type: 'commit' } })
      : json(response, 404, { message: 'Not Found' });
  if (kind === 'commits' && objects.commits.has(sha))
    return json(response, 200, {
      tree: { sha: objects.commits.get(sha).tree }
    });
  if (kind === 'blobs' && objects.blobs.has(sha))
    return json(response, 200, {
      encoding: 'base64',
      content: objects.blobs.get(sha).toString('base64'),
      size: objects.blobs.get(sha).length
    });
  if (kind !== 'trees' || !objects.trees.has(sha))
    return json(response, 404, { message: 'Not Found' });

  const recursive = url.searchParams.has('recursive');
  const tree = recursive ? flatten(objects, sha) : objects.trees.get(sha);
  const truncated = recursive && state.truncate;

  return json(response, 200, {
    sha,
    tree: truncated ? tree.slice(0, 1) : tree,
    truncated
  });
}

function repoRoute(state, rest, url, request, response, body) {
  const git = /^git\/(ref|commits|trees|blobs)\/(.+)$/.exec(rest);
  const contents = /^contents\/(.+)$/.exec(rest);

  if (rest === '' && request.method === 'GET')
    return json(response, 200, {
      id: state.repositoryId,
      full_name: state.name
    });
  if (git && request.method === 'GET')
    return gitObject(state, git[1], decodeURIComponent(git[2]), url, response);
  if (contents && request.method === 'GET')
    return getFile(state, state.relative(contents[1]), url, response);
  if (contents && request.method === 'PUT')
    return putFile(state, state.relative(contents[1]), body, response);

  return json(response, 404, { message: 'Not Found' });
}

function issueToken(state, request, response, body) {
  const jwt = (request.headers.authorization ?? '').replace(/^Bearer /, '');

  if (!validJwt(jwt, state.publicKey, state.clientId))
    return json(response, 401, {
      message: 'A JSON web token could not be decoded'
    });
  if (
    body.repository_ids?.length !== 1 ||
    body.repository_ids[0] !== state.repositoryId
  )
    return json(response, 422, { message: 'Repository is not installed' });

  const token = `ghs_sim_${randomUUID()}`;
  const expires = Date.now() + state.tokenTtlMs;

  state.tokens.set(token, expires);
  state.tokensIssued++;

  return json(response, 201, {
    token,
    expires_at: new Date(expires).toISOString()
  });
}

async function answer(state, request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const body = ['POST', 'PUT'].includes(request.method)
    ? await bodyOf(request)
    : {};

  state.requests.push(`${request.method} ${url.pathname}${url.search}`);

  if (state.failures.length) return json(response, state.failures.shift(), {});
  if (request.method === 'PUT' && state.writeFailures.length)
    return json(response, state.writeFailures.shift(), {});

  if (
    url.pathname === `/app/installations/${state.installationId}/access_tokens`
  )
    return issueToken(state, request, response, body);

  const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');

  if (!(state.tokens.get(token) > Date.now()))
    return json(response, 401, { message: 'Bad credentials' });

  const prefix = `/repos/${state.name}`;

  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
    return json(response, 404, { message: 'Not Found' });

  return repoRoute(
    state,
    url.pathname.slice(prefix.length + 1),
    url,
    request,
    response,
    body
  );
}

/** Sends one push delivery, signed like GitHub's; records its answer. */
async function send(state, delivery) {
  const { url, secret } = state.hook;
  const body = JSON.stringify(delivery.payload);
  const status = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'GitHub-Hookshot/simulated',
      'x-github-event': delivery.event,
      'x-github-delivery': delivery.id,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
    },
    body
  }).then(
    response => response.status,
    () => 0
  );

  state.deliveries.push({
    id: delivery.id,
    after: delivery.payload.after,
    status
  });

  return status;
}

/** A push to the branch, delivered now or held for a test to release. */
function announce(state, before) {
  if (!state.hook) return Promise.resolve();

  const delivery = {
    id: randomUUID(),
    event: 'push',
    payload: {
      ref: `refs/heads/${state.branch}`,
      before,
      after: state.head,
      repository: { id: state.repositoryId, full_name: state.name },
      installation: { id: state.installationId }
    }
  };

  if (state.holding) {
    state.held.push(delivery);

    return Promise.resolve();
  }

  return send(state, delivery);
}

/**
 * Serves one repository on 127.0.0.1:`port` (0 picks a free port). `files`
 * maps repository paths to text. Resolves to the simulator's controls.
 */
export async function startGitHubSimulator({
  port = 0,
  publicKey,
  clientId,
  installationId,
  name,
  repositoryId,
  branch = 'main',
  dir = 'content',
  files = new Map(),
  tokenTtlMs = 60 * 60_000
}) {
  const objects = { blobs: new Map(), trees: new Map(), commits: new Map() };
  const state = {
    publicKey,
    clientId,
    installationId,
    name,
    repositoryId,
    branch,
    tokenTtlMs,
    objects,
    files: new Map(files),
    head: '',
    commits: [],
    tokens: new Map(),
    tokensIssued: 0,
    requests: [],
    failures: [],
    writeFailures: [],
    truncate: false,
    hook: null,
    holding: false,
    held: [],
    deliveries: [],
    relative: path => decodeURIComponent(path),
    commit(path, text, meta) {
      const before = state.head;

      if (text === null) state.files.delete(path);
      else state.files.set(path, text);

      state.head = snapshot(state.files, objects, state.head);
      state.commits.push({ path, sha: state.head, ...meta });

      return announce(state, before);
    }
  };

  state.head = snapshot(state.files, objects);

  const server = createServer((request, response) => {
    answer(state, request, response).catch(error => {
      console.error('[github-simulator]', error);
      json(response, 500, { message: String(error) });
    });
  });

  await new Promise(done => server.listen(port, '127.0.0.1', done));

  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    state,
    /** A commit made outside Venda (an agent or a developer pushing); null deletes. */
    push: (path, text, message = 'Outside edit') =>
      state.commit(`${dir ? `${dir}/` : ''}${path}`, text, {
        message,
        author: { name: 'Someone else', email: 'someone@example.com' }
      }),
    /** The next requests answer these statuses instead. */
    fail: (...statuses) => state.failures.push(...statuses),
    /** The next writes answer these statuses instead, after reads succeed. */
    failWrites: (...statuses) => state.writeFailures.push(...statuses),
    file: path => state.files.get(`${dir ? `${dir}/` : ''}${path}`),
    /** Where push webhooks go, signed with `secret`; null stops them. */
    deliverTo: (url, secret) => {
      state.hook = url ? { url, secret } : null;
    },
    /** Holds deliveries until `release`. */
    hold: () => {
      state.holding = true;
    },
    /** Sends the held deliveries, optionally newest first and each twice. */
    release: async ({ reverse = false, twice = false } = {}) => {
      const held = reverse ? state.held.reverse() : state.held;

      state.holding = false;
      state.held = [];

      for (const delivery of held) {
        await send(state, delivery);

        if (twice) await send(state, delivery);
      }
    },
    stop: () => new Promise(done => server.close(done))
  };
}

/** A folder's files as repository paths under `content/`. */
async function repositoryFrom(folder) {
  const files = new Map();
  const entries = await readdir(folder, {
    recursive: true,
    withFileTypes: true
  });

  for (const entry of entries.filter(each => each.isFile())) {
    const path = join(entry.parentPath, entry.name);

    files.set(
      `content/${relative(folder, path).split(sep).join('/')}`,
      await readFile(path, 'utf8')
    );
  }

  return files;
}

/**
 * A repository holding `folder` as its `content/`, with a fresh App key, and
 * the `VENDA_GITHUB_*` variables a Worker needs to use it. For the live suites
 * and `pnpm try`: nothing here reaches GitHub.
 */
export async function simulateRepository({ folder, port = 0, authorEmail }) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const github = await startGitHubSimulator({
    port,
    publicKey: keys.publicKey,
    clientId: 'Iv1.venda-simulated',
    installationId: 7,
    name: 'venda-simulated/site',
    repositoryId: 42,
    files: await repositoryFrom(folder)
  });

  const webhookSecret = randomBytes(24).toString('hex');

  return {
    github,
    webhookSecret,
    env: {
      VENDA_GITHUB_REPOSITORY: 'venda-simulated/site',
      VENDA_GITHUB_REPOSITORY_ID: '42',
      VENDA_GITHUB_BRANCH: 'main',
      VENDA_GITHUB_CLIENT_ID: 'Iv1.venda-simulated',
      VENDA_GITHUB_INSTALLATION_ID: '7',
      VENDA_GITHUB_PRIVATE_KEY: keys.privateKey,
      VENDA_GITHUB_WEBHOOK_SECRET: webhookSecret,
      VENDA_GITHUB_AUTHOR_EMAIL: authorEmail,
      VENDA_GITHUB_API_URL: github.url
    }
  };
}
