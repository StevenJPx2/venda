// The CLI end to end against a site in memory: real command lines, the real
// contract client, and a folder on disk.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { main } from '../src/cli';
import { fakeSite } from './fake-site';

const BLOG = `export default defineCollection({ name: 'Blog', kind: 'posts', fields: {
  title: { type: 'text', required: true, max: 40 }, body: { type: 'richtext', required: true }
} });
`;

const post = (title: string) => `---\ntitle: ${title}\n---\n\nHi.\n`;

let site: ReturnType<typeof fakeSite>;
let home: string;
let dir: string;

// Effect's fetch client keeps the `fetch` it first sees, so the stub is one
// function for the whole file that sends each request to this test's site.
beforeAll(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    site.fetch(input, init)
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  site = fakeSite('secret');
  home = await mkdtemp(join(tmpdir(), 'venda-cli-'));
  dir = join(home, 'content');
  await site.put('blog/config.ts', BLOG);
  await site.put('blog/hello.md', post('Hello'));
});

afterEach(() => rm(home, { recursive: true, force: true }));

const venda = async (...argv: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(
    argv,
    {
      VENDA_URL: 'https://site.test/',
      VENDA_TOKEN: 'secret',
      XDG_CONFIG_HOME: join(home, 'config')
    },
    { out: text => out.push(text), err: text => err.push(text) }
  );

  return { code, out: out.join(''), err: err.join('') };
};

const local = (path: string) => readFile(join(dir, path), 'utf8');

describe('pull and push', () => {
  it('pulls the files, pushes what changed, and keeps track of the SHAs', async () => {
    expect((await venda('pull', dir)).out).toContain('Pulled 2 files');
    expect(await local('blog/hello.md')).toBe(post('Hello'));

    await writeFile(join(dir, 'blog/hello.md'), post('Hello again'));
    await writeFile(join(dir, 'blog/new.md'), post('New'));
    expect((await venda('status', dir)).out).toBe(
      'changed blog/hello.md\nnew     blog/new.md\n'
    );

    const pushed = await venda('push', dir, '-m', 'Two posts', '--json');

    expect(pushed.code).toBe(0);
    expect(JSON.parse(pushed.out).written).toHaveLength(2);
    expect(site.files.get('blog/hello.md')?.text).toBe(post('Hello again'));
    expect(site.versions.at(-1)?.message).toBe('Two posts');
    expect((await venda('push', dir)).out).toContain('Nothing to push');
  });

  it('refuses a push from a stale SHA, then settles it by pull, merge and resolve', async () => {
    await venda('pull', dir);
    await writeFile(join(dir, 'blog/hello.md'), post('Mine'));
    await site.put('blog/hello.md', post('Theirs'));

    const refused = await venda('push', dir);

    expect(refused.code).toBe(1);
    expect(refused.err).toContain('blog/hello.md changed on the site');
    expect(site.files.get('blog/hello.md')?.text).toBe(post('Theirs'));

    const pulled = await venda('pull', dir);

    expect(pulled.out).toContain('kept as yours: blog/hello.md');
    expect(await local('blog/hello.md')).toBe(post('Mine'));

    expect((await venda('resolve', 'blog/hello.md', dir)).code).toBe(0);
    expect((await venda('push', dir)).code).toBe(0);
    expect(site.files.get('blog/hello.md')?.text).toBe(post('Mine'));
  });

  it('removes files deleted on the site, and deletes files removed here', async () => {
    await venda('pull', dir);
    await site.put('blog/hello.md', null);
    await venda('pull', dir);

    await expect(local('blog/hello.md')).rejects.toThrow();

    await rm(join(dir, 'blog/config.ts'));
    expect((await venda('push', dir)).out).toContain('deleted blog/config.ts');
    expect(site.files.has('blog/config.ts')).toBe(false);
  });
});

describe('history', () => {
  it('lists versions, shows one by a short SHA, and restores it', async () => {
    const first = site.files.get('blog/hello.md')?.sha ?? '';

    await site.put('blog/hello.md', post('Second'));

    expect((await venda('history', 'blog/hello.md')).out).toContain(
      first.slice(0, 7)
    );
    expect(
      (await venda('show', 'blog/hello.md', '--at', first.slice(0, 7))).out
    ).toBe(post('Hello'));
    expect(
      (await venda('restore', 'blog/hello.md', '--to', first.slice(0, 7))).out
    ).toContain('Restored blog/hello.md');
    expect(site.files.get('blog/hello.md')?.text).toBe(post('Hello'));
    expect(
      (await venda('restore', 'blog/hello.md', '--to', first)).out
    ).toContain('already at');
  });

  it('names a version it cannot find, and a file that is not there', async () => {
    expect(
      (await venda('show', 'blog/hello.md', '--at', 'fffffff')).err
    ).toContain('has no version fffffff');
    expect((await venda('show', 'blog/gone.md')).err).toContain(
      'does not exist on the site'
    );
    expect((await venda('history', 'blog/gone.md')).out).toContain(
      'no history'
    );
  });
});

describe('settings and entries', () => {
  it('shows and changes the site settings', async () => {
    expect(
      (await venda('site', 'set', 'name=Hill Notes', 'screen.settings=')).out
    ).toBe('name: Hill Notes\nurl: (none)\nscreen.settings: (hidden)\n');
    expect((await venda('site')).out).toContain('name: Hill Notes');
    expect((await venda('site', 'set')).code).toBe(1);
  });

  it('creates and updates an entry against its model, refusing what does not fit', async () => {
    const body = join(home, 'body.md');

    await writeFile(body, 'Leaves **fall**.\n');

    const created = await venda(
      'entry',
      'set',
      'blog',
      'autumn',
      '--set',
      'title=Autumn',
      '--markdown',
      `body=${body}`
    );

    expect(created.out).toContain('Created blog/autumn.md');
    expect(site.files.get('blog/autumn.md')?.text).toContain(
      'Leaves **fall**.'
    );

    await venda('entry', 'set', 'blog', 'autumn', '--set', 'title=Late autumn');
    expect(site.files.get('blog/autumn.md')?.text).toContain(
      'title: Late autumn'
    );

    const tooLong = await venda(
      'entry',
      'set',
      'blog',
      'autumn',
      '--set',
      `title=${'x'.repeat(41)}`
    );

    expect(tooLong.code).toBe(1);
    expect(
      (await venda('entry', 'set', 'notes', 'a', '--set', 'title=A')).err
    ).toContain('no collection notes');
    expect((await venda('entry', 'frob', 'blog', 'a')).code).toBe(1);
  });
});

describe('the command line', () => {
  it('imports and exports a folder', async () => {
    await writeFile(
      join(home, 'site.ts'),
      "export default defineSite({ name: 'X' });\n"
    );

    expect((await venda('import', home)).out).toContain('Imported 1 file');
    expect((await venda('export', dir)).out).toContain('Exported 3 files');
    expect(await local('site.ts')).toContain("name: 'X'");
    expect((await venda('import', join(home, 'nothing'))).code).toBe(1);
  });

  it('logs in, and says what to do when it cannot', async () => {
    expect(
      (await venda('login', '--url', 'https://site.test', '--token', 'secret'))
        .out
    ).toContain('as Ann Lee (editor)');
    expect(
      (await venda('login', '--url', 'https://site.test', '--token', 'wrong'))
        .err
    ).toContain('refused the token');
    expect((await venda('frob', '--json')).out).toContain(
      '"error": "BadArgument"'
    );
    expect((await venda('history')).err).toContain('Missing the path');
    expect((await venda('--help')).out).toContain('venda pull');
  });
});
