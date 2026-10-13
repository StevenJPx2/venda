import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { processHost } from './try-process.mjs';

test('captures commands and stops a running child before closing', async () => {
  const state = await mkdtemp(join(tmpdir(), 'venda-process-'));
  const host = processHost(state, state);
  const answer = await host.capture('answer', process.execPath, [
    '-e',
    'console.log(42)'
  ]);

  assert.equal(answer.code, 0);
  assert.equal(answer.out.trim(), '42');
  const child = host.start('server', process.execPath, [
    '-e',
    'setInterval(() => {}, 1000)'
  ]);

  await new Promise(resolve => child.once('spawn', resolve));
  await host.stop(child);
  assert.equal((await child.done).signal, 'SIGTERM');
  await host.close();
  assert.throws(() => host.start('late', process.execPath, []), /stopping/);
});

test('reports spawn errors and failed builds without leaving children', async () => {
  const state = await mkdtemp(join(tmpdir(), 'venda-process-'));
  const host = processHost(state, state);

  await assert.rejects(
    host.capture('missing', '/no-such-venda-command', []),
    /ENOENT/
  );
  await assert.rejects(
    host.step('broken', process.execPath, ['-e', 'process.exit(1)']),
    /broken failed/
  );
  await host.step('working', process.execPath, ['-e', 'process.exit(0)']);
  await host.close();
});
