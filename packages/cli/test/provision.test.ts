import { describe, expect, it } from 'vitest';
import { ensureResources } from '../src/provision.js';
import type { Runner, RunResult } from '../src/wrangler.js';

function fakeRunner(): Runner {
  let d1: { name: string; uuid: string }[] = [];
  let kv: { title: string; id: string }[] = [];
  let r2: string[] = [];
  return async (args: string[]): Promise<RunResult> => {
    const command = args.join(' ');
    if (command === 'd1 list --json') return { code: 0, stdout: JSON.stringify(d1), stderr: '' };
    if (command === 'kv namespace list') return { code: 0, stdout: JSON.stringify(kv), stderr: '' };
    if (command === 'r2 bucket list') return { code: 0, stdout: r2.map(name => `name: ${name}`).join('\n'), stderr: '' };
    if (command === 'd1 create cms-content') d1 = [{ name: 'cms-content', uuid: 'd1-id' }];
    else if (command === 'kv namespace create cms-cache') kv = [{ title: 'cms-cache', id: 'kv-id' }];
    else if (command === 'r2 bucket create cms-media') r2 = ['cms-media'];
    else throw new Error(`Unexpected Wrangler command: ${command}`);
    return { code: 0, stdout: 'created', stderr: '' };
  };
}

describe('ensureResources', () => {
  it('creates D1, KV and R2 and returns their IDs', async () => {
    await expect(ensureResources(fakeRunner(), 'cms')).resolves.toEqual({
      d1: { name: 'cms-content', id: 'd1-id' },
      kv: { title: 'cms-cache', id: 'kv-id' },
      r2: { name: 'cms-media' }
    });
  });

  it('does not recreate resources that already exist', async () => {
    const runner: Runner = async (args) => {
      const command = args.join(' ');
      if (command === 'd1 list --json') return { code: 0, stdout: '[{"name":"cms-content","uuid":"d1-id"}]', stderr: '' };
      if (command === 'kv namespace list') return { code: 0, stdout: '[{"title":"cms-cache","id":"kv-id"}]', stderr: '' };
      if (command === 'r2 bucket list') return { code: 0, stdout: 'name: cms-media', stderr: '' };
      throw new Error(`Existing resources must not be recreated: ${command}`);
    };
    await expect(ensureResources(runner, 'cms')).resolves.toMatchObject({ d1: { id: 'd1-id' }, kv: { id: 'kv-id' }, r2: { name: 'cms-media' } });
  });
});
