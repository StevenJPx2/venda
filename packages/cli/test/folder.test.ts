import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import {
  readFolder,
  readManifest,
  removeFrom,
  shasOf,
  writeInto,
  writeManifest
} from '../src/folder';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'venda-cli-'));
});

it('reads only content files, and writes into collection folders', async () => {
  await writeInto(dir, 'blog/hello.md', 'Hi\n');
  await writeInto(dir, 'site.ts', 'export default defineSite({});\n');
  await writeFile(join(dir, 'README.md'), 'Not content');

  const files = await readFolder(dir);

  expect([...files.keys()].sort()).toEqual(['blog/hello.md', 'site.ts']);
  expect((await shasOf(files)).get('blog/hello.md')).toHaveLength(40);

  await removeFrom(dir, 'blog/hello.md');
  expect([...(await readFolder(dir)).keys()]).toEqual(['site.ts']);
});

it('refuses a path outside the content layout', async () => {
  await expect(writeInto(dir, '../escape.md', 'x')).rejects.toMatchObject({
    tag: 'NotContent'
  });
});

it('keeps the SHAs a folder was pulled at, for one site only', async () => {
  expect(await readManifest(dir, 'https://a.test')).toEqual(new Map());

  await writeManifest(dir, 'https://a.test', new Map([['site.ts', 'abc']]));

  expect(await readManifest(dir, 'https://a.test')).toEqual(
    new Map([['site.ts', 'abc']])
  );
  expect(await readFile(join(dir, '.venda/shas.json'), 'utf8')).toContain(
    '"site.ts": "abc"'
  );
  await expect(readManifest(dir, 'https://b.test')).rejects.toMatchObject({
    tag: 'OtherSite'
  });
});
