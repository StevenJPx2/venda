// The built `venda` command against the real Worker on workerd and D1, with
// an API token: an agent's loop of pull, edit and push, the conflict rule,
// history and restore, site settings and entries.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addPerson,
  buildWorkers,
  check,
  contentFiles,
  ROOT,
  run,
  signedIn,
  startWorkers,
  suite,
  WORKERS,
  workersState
} from './support.mjs';

const VENDA = `${ROOT}/packages/cli/dist/venda.mjs`;
const FILE = 'field-notes/first-light.md';

/** Runs `venda` with `env`; resolves to its exit code and output. */
const venda = (env, ...args) =>
  new Promise(resolvePromise =>
    execFile(
      process.execPath,
      [VENDA, ...args],
      { env: { ...process.env, ...env } },
      (error, out, err) =>
        resolvePromise({ code: error ? (error.code ?? 1) : 0, out, err })
    )
  );

const title = async slug =>
  (await (await fetch(`${WORKERS}/api/content/field-notes/${slug}`)).json())
    .data?.title;

const retitle = (text, to) => text.replace(/^title: .*$/m, `title: ${to}`);

async function pullAndPush(as, dir, files) {
  const pulled = await venda(as, 'pull', dir);
  const local = join(dir, FILE);

  check(
    'CLI: pull writes every content file as the site has it',
    pulled.code === 0 &&
      (await readFile(local, 'utf8')) === (await files.read(FILE)),
    pulled.err
  );

  await writeFile(
    local,
    retitle(await readFile(local, 'utf8'), 'Pushed by an agent')
  );
  await writeFile(
    join(dir, 'field-notes/from-cli.md'),
    '---\ntitle: From the CLI\n---\n\nWritten in a folder.\n'
  );

  const pushed = await venda(as, 'push', dir, '-m', 'Two notes', '--json');

  check(
    'CLI: push publishes a changed and a new file at once, served by the next request',
    pushed.code === 0 &&
      JSON.parse(pushed.out).written.length === 2 &&
      (await title('first-light')) === 'Pushed by an agent' &&
      (await title('from-cli')) === 'From the CLI',
    pushed.out + pushed.err
  );
}

async function conflictChecks(as, dir, files) {
  const local = join(dir, FILE);

  await writeFile(local, retitle(await readFile(local, 'utf8'), 'Mine'));
  await files.write(FILE, retitle(await files.read(FILE), 'Theirs'));

  const refused = await venda(as, 'push', dir);

  check(
    'CLI: a push from a stale SHA writes nothing and says how to settle it',
    refused.code === 1 &&
      refused.err.includes(`${FILE} changed on the site`) &&
      (await title('first-light')) === 'Theirs',
    refused.err
  );

  const pulled = await venda(as, 'pull', dir);
  const resolved = await venda(as, 'resolve', FILE, dir);
  const pushed = await venda(as, 'push', dir);

  check(
    'CLI: pull keeps the edit, resolve takes theirs as the base, and the push lands',
    pulled.out.includes(`kept as yours: ${FILE}`) &&
      resolved.code === 0 &&
      pushed.code === 0 &&
      (await title('first-light')) === 'Mine',
    pulled.out + pushed.err
  );
}

async function historyChecks(as, original) {
  const history = await venda(as, 'history', FILE, '--json');
  const versions = JSON.parse(history.out).revisions;
  const first = versions.at(-1)?.sha ?? '';
  const restored = await venda(as, 'restore', FILE, '--to', first.slice(0, 7));

  check(
    'CLI: history lists every version, and restore publishes the first again',
    versions.length >= 4 &&
      versions[0].message === 'Push from the venda CLI' &&
      restored.code === 0 &&
      (await (await contentFiles()).read(FILE)) === original,
    history.err + restored.err
  );
}

async function siteAndEntryChecks(as) {
  const site = await venda(as, 'site', 'set', 'name=Notes by the CLI');
  const body = join(tmpdir(), `venda-body-${process.pid}.md`);

  await writeFile(body, 'Set from **Markdown**.\n');

  const entry = await venda(
    as,
    'entry',
    'set',
    'field-notes',
    'by-entry-set',
    '--set',
    'title=Set field by field',
    '--set-json',
    'tags=["cli"]',
    '--markdown',
    `body=${body}`
  );
  const served = await (
    await fetch(`${WORKERS}/api/content/field-notes/by-entry-set`)
  ).json();

  await rm(body, { force: true });
  check(
    'CLI: site set writes site.ts, and entry set publishes an entry against its model',
    site.code === 0 &&
      (await (await fetch(`${WORKERS}/api/site`)).json()).name ===
        'Notes by the CLI' &&
      entry.code === 0 &&
      served.data?.title === 'Set field by field' &&
      served.data?.tags?.[0] === 'cli',
    site.err + entry.err
  );
}

await suite('cli', async () => {
  const state = await workersState();

  await buildWorkers();
  await run('pnpm', ['--filter', '@venda/cli', 'build']);

  const stopWorkers = await startWorkers(state);
  const owner = await signedIn();
  const token = (await owner('/tokens', 'POST', { name: 'CLI' })).json.secret;
  const home = await mkdtemp(join(tmpdir(), 'venda-cli-e2e-'));
  const config = { XDG_CONFIG_HOME: join(home, 'config') };
  const as = { ...config, VENDA_URL: WORKERS, VENDA_TOKEN: token };
  const files = await contentFiles();
  const original = await files.read(FILE);
  const login = await venda(
    config,
    'login',
    '--url',
    WORKERS,
    '--token',
    token
  );

  check(
    'CLI: login checks the token with the site and saves it',
    login.code === 0 && login.out.includes('as '),
    login.err
  );

  await pullAndPush(as, join(home, 'content'), files);
  await conflictChecks(as, join(home, 'content'), files);
  await historyChecks(as, original);
  await siteAndEntryChecks(as);

  const author = await addPerson(owner, 'author');
  const authorToken = (await author.api('/tokens', 'POST', { name: 'CLI' }))
    .json.secret;
  const refused = await venda(
    { ...config, VENDA_URL: WORKERS, VENDA_TOKEN: authorToken },
    'pull',
    join(home, 'author')
  );

  check(
    'CLI: an author’s token is refused the files',
    refused.code === 1 && refused.err.includes('administrators and editors'),
    refused.err
  );
  await rm(home, { recursive: true, force: true });
  await stopWorkers();
});
