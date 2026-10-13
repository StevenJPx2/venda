import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { affected, rebuildQueue, watchSources } from './try-watch.mjs';
import { tryBuilder } from './try-build.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => Promise.withResolvers();

test('only source files trigger their dependent builds', () => {
  assert.deepEqual(affected('pnpm-lock.yaml'), ['admin', 'server', 'cli']);
  assert.deepEqual(affected('apps/admin/app/app.vue'), ['admin', 'server']);
  assert.deepEqual(affected('packages/editor-writer/src/WriterTitle.vue'), [
    'admin',
    'server'
  ]);
  assert.deepEqual(affected('packages/core/src/content/files.ts'), ['server']);
  assert.deepEqual(affected('packages/core/drizzle/new/migration.sql'), [
    'server'
  ]);
  assert.deepEqual(affected('packages/cli/src/main.ts'), ['cli']);
  assert.deepEqual(affected('packages/contract/src/index.ts'), [
    'admin',
    'server',
    'cli'
  ]);
  assert.deepEqual(affected('try/slice-4.html'), ['pages']);
  for (const path of [
    'try/content/site.ts',
    'packages/cli/dist/venda.mjs',
    'apps/admin/.nuxt/index.ts',
    'apps/admin/dist/index.html',
    'packages/core/test/mistakes-unchecked.ts',
    'packages/server/node_modules/nitro/dist/index.mjs',
    'packages/server',
    'packages/server/src'
  ])
    assert.deepEqual(affected(path), []);
});

test('the filesystem watcher sees new files and stops after close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'venda-watch-'));

  for (const path of ['apps/admin', 'packages/core/src', 'try'])
    await mkdir(join(root, path), { recursive: true });

  const changed = deferred();
  const close = watchSources(root, {
    add(kinds) {
      if (kinds.length) changed.resolve(kinds);
    }
  });

  try {
    await writeFile(
      join(root, 'packages/core/src/new.ts'),
      'export const value = 1;'
    );
    assert.deepEqual(await changed.promise, ['server']);
  } finally {
    close();
  }
});

test('a burst becomes one build; edits during it become one follow-up', async () => {
  const started = deferred();
  const release = deferred();
  const finished = deferred();
  const builds = [];
  const errors = [];
  const queue = rebuildQueue(
    async kinds => {
      builds.push([...kinds].sort());

      if (builds.length === 1) {
        started.resolve();
        await release.promise;
      } else finished.resolve();
    },
    error => errors.push(error),
    5
  );

  queue.add(['admin']);
  queue.add(['server']);
  await started.promise;
  queue.add(['server']);
  queue.add(['cli']);
  await pause(15);
  assert.equal(builds.length, 1);
  release.resolve();
  await finished.promise;
  await queue.close();
  assert.deepEqual(builds, [
    ['admin', 'server'],
    ['cli', 'server']
  ]);
  assert.deepEqual(errors, []);
});

test('a failed build can be retried, and closing cancels queued work', async () => {
  const failed = deferred();
  const retried = deferred();
  let attempts = 0;
  const queue = rebuildQueue(
    () => {
      attempts++;

      if (attempts === 1) throw new Error('bad source');

      retried.resolve();
    },
    error => failed.resolve(error),
    5
  );

  queue.add(['server']);
  assert.equal((await failed.promise).message, 'bad source');
  queue.add(['server']);
  await retried.promise;
  queue.add(['admin']);
  await queue.close();
  queue.add(['server']);
  await pause(15);
  assert.equal(attempts, 2);
});

test('staged builds install only on success and never touch the live slot', async () => {
  const runs = [];
  const installed = [];
  let fail = false;
  const build = tryBuilder(
    '/scratch',
    async (name, _cmd, _args, env) => {
      runs.push({ name, env });

      if (name === 'build the Worker' && fail) throw new Error('bad Worker');
    },
    async output => {
      installed.push(output);
    }
  );

  await build(new Set(['admin', 'server', 'cli']));
  assert.equal(installed[0].workerDir, '/scratch/build/0');
  assert.equal(runs[0].env.VENDA_ADMIN_OUTPUT_DIR, '/scratch/admin/0');
  fail = true;
  await assert.rejects(build(new Set(['admin'])), /bad Worker/);
  assert.equal(installed.length, 1);
  assert.equal(runs[3].env.VENDA_ADMIN_OUTPUT_DIR, '/scratch/admin/1');
  fail = false;
  await build(new Set(['server']));
  assert.equal(installed[1].workerDir, '/scratch/build/1');
  assert.equal(runs.at(-1).env.VENDA_ADMIN_OUTPUT_DIR, '/scratch/admin/0');
  await build(new Set(['cli']));
  assert.equal(installed[2].cliDir, '/scratch/cli-build/1');
  await build(new Set(['pages']));
  assert.equal(installed[3].server, false);
  assert.equal(installed[3].cli, false);
});
