import { resourceNames, type ResourceRefs } from './project.js';
import { parseD1List, parseKvList, parseR2List, wrangler, type Runner } from './wrangler.js';

async function findD1(runner: Runner, name: string) {
  return parseD1List(await wrangler(runner, ['d1', 'list', '--json'])).find(db => db.name === name);
}

async function findKv(runner: Runner, title: string) {
  return parseKvList(await wrangler(runner, ['kv', 'namespace', 'list'])).find(ns => ns.title === title);
}

async function hasR2(runner: Runner, name: string): Promise<boolean> {
  return parseR2List(await wrangler(runner, ['r2', 'bucket', 'list'])).includes(name);
}

/**
 * Finds or creates the install's D1 database, KV namespace and R2 bucket.
 * Idempotent: re-running after a partial failure reuses whatever exists.
 * Resources are re-listed after creation rather than parsing create output.
 */
export async function ensureResources(runner: Runner, name: string, onStep: (message: string) => void = () => {}): Promise<ResourceRefs> {
  const names = resourceNames(name);

  let d1 = await findD1(runner, names.d1);
  if (!d1) {
    onStep(`Creating D1 database ${names.d1}`);
    await wrangler(runner, ['d1', 'create', names.d1]);
    d1 = await findD1(runner, names.d1);
  }

  let kv = await findKv(runner, names.kv);
  if (!kv) {
    onStep(`Creating KV namespace ${names.kv}`);
    await wrangler(runner, ['kv', 'namespace', 'create', names.kv]);
    kv = await findKv(runner, names.kv);
  }

  if (!(await hasR2(runner, names.r2))) {
    onStep(`Creating R2 bucket ${names.r2}`);
    await wrangler(runner, ['r2', 'bucket', 'create', names.r2]);
  }

  if (!d1 || !kv) throw new Error('Cloudflare did not report the resources that were just created. Run `venda init` again to retry.');

  return { d1, kv: { title: kv.title, id: kv.id }, r2: { name: names.r2 } };
}

export interface ResourceHealth { d1: boolean; kv: boolean; r2: boolean }

/** Which recorded resources still exist (for `venda doctor`). */
export async function checkResources(runner: Runner, resources: ResourceRefs): Promise<ResourceHealth> {
  const [d1, kv, r2] = await Promise.all([
    wrangler(runner, ['d1', 'list', '--json']).then(out => parseD1List(out).some(db => db.id === resources.d1.id)),
    wrangler(runner, ['kv', 'namespace', 'list']).then(out => parseKvList(out).some(ns => ns.id === resources.kv.id)),
    hasR2(runner, resources.r2.name)
  ]);
  return { d1, kv, r2 };
}
