// The GitHub store against the GitHub simulator: the same requests, answers
// and failures as the real API, with real JWTs and tokens.
import { generateKeyPairSync } from 'node:crypto';
import { gitBlobSha, type ContentCommit } from '@venda/core/content';
import { Effect, Result } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  startGitHubSimulator,
  type GitHubSimulator
} from '../../../scripts/github-simulator.mjs';
import { gitHubApi } from '../src/github/api';
import type { GitHubConfig } from '../src/github/config';
import { githubStore } from '../src/github/store';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const BLOG =
  "export default defineCollection({ name: 'Blog', kind: 'posts', fields: { title: { type: 'text' } } });";

const HELLO = '---\ntitle: Café ☕\n---\n\nHello.\n';

let sim: GitHubSimulator;

let config: GitHubConfig;

beforeEach(async () => {
  sim = await startGitHubSimulator({
    publicKey: keys.publicKey,
    clientId: 'Iv1.test',
    installationId: 7,
    name: 'acme/site',
    repositoryId: 42,
    files: new Map([
      ['README.md', 'Not content'],
      ['content/blog/config.ts', BLOG],
      ['content/blog/hello.md', HELLO],
      ['content/blog/photo.jpg', 'binary']
    ])
  });
  config = {
    owner: 'acme',
    repo: 'site',
    repositoryId: 42,
    branch: 'main',
    dir: 'content',
    clientId: 'Iv1.test',
    installationId: 7,
    privateKey: keys.privateKey,
    webhookSecret: 'test-webhook-secret',
    authorEmail: 'venda@users.noreply.example',
    apiUrl: new URL(sim.url)
  };
});

afterEach(() => sim.stop());

const store = (overrides: Partial<GitHubConfig> = {}) => {
  const merged = { ...config, ...overrides };

  return githubStore(merged, gitHubApi(merged));
};

const sha = (text: string) => gitBlobSha(new TextEncoder().encode(text));

const edit = async (
  content: string,
  baseSha: string | null,
  path = 'blog/hello.md'
): Promise<ContentCommit> => ({
  path,
  content,
  baseSha,
  sha: await sha(content),
  message: `Publish ${path}`,
  author: 'Ann Lee via Venda'
});

describe('reading', () => {
  it('lists the content folder with git SHAs, and reads text faithfully', async () => {
    const snapshot = await Effect.runPromise(store().snapshot);

    expect(snapshot.files.map(file => file.path).sort()).toEqual([
      'blog/config.ts',
      'blog/hello.md'
    ]);
    expect(
      snapshot.files.find(file => file.path === 'blog/hello.md')?.sha
    ).toBe(await sha(HELLO));
    expect(await Effect.runPromise(snapshot.read('blog/hello.md'))).toBe(HELLO);
  });

  it('keeps a snapshot on its commit while the branch moves on', async () => {
    const snapshot = await Effect.runPromise(store().snapshot);

    sim.push('blog/hello.md', '---\ntitle: Moved\n---\n');

    expect(await Effect.runPromise(snapshot.read('blog/hello.md'))).toBe(HELLO);
    expect(await Effect.runPromise(store().read('blog/hello.md'))).toContain(
      'Moved'
    );
  });

  it('walks a tree too large for one answer and finds the same files', async () => {
    sim.state.truncate = true;

    const listed = await Effect.runPromise(store().list);

    expect(listed.map(file => file.path).sort()).toEqual([
      'blog/config.ts',
      'blog/hello.md'
    ]);
  });

  it('fails on a missing branch rather than reporting an empty repository', async () => {
    const result = await Effect.runPromise(
      Effect.result(store({ branch: 'gone' }).list)
    );

    expect(Result.isFailure(result)).toBe(true);
  });

  it('refuses a repository other than the configured one', async () => {
    const result = await Effect.runPromise(
      Effect.result(store({ repositoryId: 43 }).list)
    );

    expect(Result.isFailure(result)).toBe(true);
  });
});

describe('publishing', () => {
  it('commits an edit with its message and attribution', async () => {
    const input = await edit('---\ntitle: Edited ☕\n---\n', await sha(HELLO));
    const written = await Effect.runPromise(store().commit(input));

    expect(written.sha).toBe(input.sha);
    expect(sim.file('blog/hello.md')).toBe(input.content);
    expect(sim.state.commits.at(-1)).toMatchObject({
      path: 'content/blog/hello.md',
      message: 'Publish blog/hello.md',
      author: {
        name: 'Ann Lee via Venda',
        email: 'venda@users.noreply.example'
      }
    });
  });

  it('never writes over a change made outside Venda', async () => {
    sim.push('blog/hello.md', '---\ntitle: Theirs\n---\n');

    const result = await Effect.runPromise(
      Effect.result(store().commit(await edit('mine', await sha(HELLO))))
    );

    expect(Result.isFailure(result) && result.failure._tag).toBe('Conflict');
    expect(sim.file('blog/hello.md')).toContain('Theirs');
  });

  it('creates a new file, and never over one that appeared meanwhile', async () => {
    const created = await edit('---\ntitle: New\n---\n', null, 'blog/new.md');

    await Effect.runPromise(store().commit(created));
    expect(sim.file('blog/new.md')).toBe(created.content);

    const again = await Effect.runPromise(
      Effect.result(store().commit(await edit('other', null, 'blog/new.md')))
    );

    expect(Result.isFailure(again) && again.failure._tag).toBe('Conflict');
  });

  it('finishes a retried intent without a second commit', async () => {
    const input = await edit('---\ntitle: Once\n---\n', await sha(HELLO));
    const github = store();

    await Effect.runPromise(github.commit(input));

    const commits = sim.state.commits.length;

    expect((await Effect.runPromise(github.commit(input))).sha).toBe(input.sha);
    expect(sim.state.commits.length).toBe(commits);
  });

  it('reports an outage during a write without retrying it', async () => {
    const github = store();

    const input = await edit('---\ntitle: Later\n---\n', await sha(HELLO));

    await Effect.runPromise(github.list);
    sim.failWrites(502);

    const puts = () =>
      sim.state.requests.filter(line => line.startsWith('PUT')).length;
    const result = await Effect.runPromise(Effect.result(github.commit(input)));

    expect(Result.isFailure(result) && result.failure._tag).toBe(
      'ContentStoreError'
    );
    expect(puts()).toBe(1);
    expect(sim.file('blog/hello.md')).toBe(HELLO);
    // The same intent, tried again once GitHub is back, goes through.
    expect((await Effect.runPromise(github.commit(input))).sha).toBe(input.sha);
  });
});

describe('a branch that moves under a write', () => {
  it('tries again while the file itself is unchanged, making one commit', async () => {
    // Another publish committed a different file between our read and write.
    sim.failWrites(409);

    const input = await edit(
      '---\ntitle: After a race\n---\n',
      await sha(HELLO)
    );
    const written = await Effect.runPromise(store().commit(input));

    expect(written.sha).toBe(input.sha);
    expect(sim.file('blog/hello.md')).toBe(input.content);
    expect(
      sim.state.commits.filter(commit => commit.message === input.message)
    ).toHaveLength(1);
  });

  it('gives up after three tries', async () => {
    sim.failWrites(409, 409, 409);

    const result = await Effect.runPromise(
      Effect.result(store().commit(await edit('x', await sha(HELLO))))
    );

    expect(Result.isFailure(result) && result.failure._tag).toBe(
      'ContentStoreError'
    );
    expect(sim.file('blog/hello.md')).toBe(HELLO);
  });
});

describe('refusals', () => {
  it('reports a refusal that is not about the file (branch protection) as a failure, not a conflict', async () => {
    sim.failWrites(422);

    const result = await Effect.runPromise(
      Effect.result(store().commit(await edit('x', await sha(HELLO))))
    );

    expect(Result.isFailure(result) && result.failure._tag).toBe(
      'ContentStoreError'
    );
    expect(sim.file('blog/hello.md')).toBe(HELLO);
  });
});

describe('the installation token', () => {
  it('is fetched once for many requests, and once for concurrent first requests', async () => {
    const github = store();

    await Promise.all([
      Effect.runPromise(github.list),
      Effect.runPromise(github.read('blog/hello.md'))
    ]);
    await Effect.runPromise(github.list);

    expect(sim.state.tokensIssued).toBe(1);
  });

  it('is renewed before it expires', async () => {
    await sim.stop();
    sim = await startGitHubSimulator({
      publicKey: keys.publicKey,
      clientId: 'Iv1.test',
      installationId: 7,
      name: 'acme/site',
      repositoryId: 42,
      // Short-lived, so it is renewed half way through its life.
      tokenTtlMs: 1_000
    });

    const github = store({ apiUrl: new URL(sim.url) });

    await Effect.runPromise(github.list);
    await Effect.runPromise(github.list);
    expect(sim.state.tokensIssued).toBe(1);

    await new Promise(done => setTimeout(done, 600));
    await Effect.runPromise(github.list);
    expect(sim.state.tokensIssued).toBe(2);
  });

  it('retries a read through a brief outage', async () => {
    const github = store();

    await Effect.runPromise(github.list);
    sim.fail(502);

    expect(await Effect.runPromise(github.read('blog/hello.md'))).toBe(HELLO);
  });
});
