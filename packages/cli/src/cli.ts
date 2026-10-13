// `venda`: a Venda site's content files from the command line, for
// developers, scripts and agents. Every command prints words, or JSON with
// `--json`, and exits non-zero on failure, naming what to do next.
import { parseArgs } from 'node:util';
import { connect, request } from './client';
import { entryGet, entrySet } from './commands/entry';
import { history, restore, show } from './commands/history';
import { siteSet, siteShow } from './commands/site';
import { pull, push, resolve, status } from './commands/sync';
import { exportFolder, importFolder } from './commands/transfer';
import { report, type Context, type Report } from './context';
import { CliFailure } from './failure';
import { currentLogin, saveLogin, siteOf, type Env } from './login';

const OPTIONS = {
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  message: { type: 'string', short: 'm' },
  discard: { type: 'boolean' },
  url: { type: 'string' },
  token: { type: 'string' },
  at: { type: 'string' },
  to: { type: 'string' },
  sha: { type: 'string' },
  set: { type: 'string', multiple: true },
  'set-json': { type: 'string', multiple: true },
  markdown: { type: 'string', multiple: true }
} as const;

type Flags = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS }>
>['values'];

const HELP = `venda: a Venda site's content files from the command line

  venda login --url <site> --token <API token>
  venda pull [dir] [--discard]       the site's files into a folder (default .)
  venda status [dir]                 what changed in the folder since the pull
  venda push [dir] [-m message]      publish those changes, all or none
  venda resolve <path> [dir] [--sha <sha>]
                                     after merging a conflict: replace the site's version
  venda history <path>               a file's versions, newest first
  venda show <path> [--at <sha>]     a file's text on the site, now or at a version
  venda restore <path> --to <sha>    publish an earlier version again
  venda site                         the site's settings
  venda site set name=… url=… screen.<id>=…
  venda entry get <collection> <slug>
  venda entry set <collection> <slug> [--set field=text] [--set-json field=<JSON>]
                                     [--markdown field=<file.md>] [-m message]
  venda import <dir>                 a content folder into the site (administrators)
  venda export <dir>                 the site's files into a folder

  --json prints JSON. VENDA_URL and VENDA_TOKEN override the saved login.
  A push or a write is refused, with nothing written, when a file changed on
  the site since it was read: pull, merge, resolve, push again.`;

/** The argument at `index`, which the command needs. */
function needed(args: ReadonlyArray<string>, index: number, what: string) {
  const value = args[index];

  if (value === undefined)
    throw new CliFailure(
      'BadArgument',
      `Missing ${what}: see \`venda --help\``
    );

  return value;
}

type Run = (context: Context, args: string[], flags: Flags) => Promise<Report>;

const COMMANDS = new Map<string, Run>([
  ['pull', (c, [dir = '.'], f) => pull(c, dir, f.discard ?? false)],
  ['status', (c, [dir = '.']) => status(c, dir)],
  [
    'push',
    (c, [dir = '.'], f) => push(c, dir, f.message ?? 'Push from the venda CLI')
  ],
  [
    'resolve',
    (c, args, f) =>
      resolve(c, args[1] ?? '.', needed(args, 0, 'the path'), f.sha)
  ],
  ['history', (c, args) => history(c, needed(args, 0, 'the path'))],
  ['show', (c, args, f) => show(c, needed(args, 0, 'the path'), f.at)],
  [
    'restore',
    (c, args, f) =>
      restore(
        c,
        needed(args, 0, 'the path'),
        needed([f.to ?? ''].filter(Boolean), 0, '--to <sha>')
      )
  ],
  [
    'site',
    (c, [sub, ...pairs]) => (sub === 'set' ? siteSet(c, pairs) : siteShow(c))
  ],
  ['entry', entryCommand],
  ['import', (c, args) => importFolder(c, needed(args, 0, 'the folder'))],
  ['export', (c, args) => exportFolder(c, needed(args, 0, 'the folder'))]
]);

function entryCommand(context: Context, args: string[], flags: Flags) {
  const [sub] = args;
  const collection = needed(args, 1, 'the collection');
  const slug = needed(args, 2, 'the slug');

  if (sub === 'get') return entryGet(context, collection, slug);

  if (sub !== 'set')
    throw new CliFailure(
      'BadArgument',
      'Expected `venda entry get` or `venda entry set`'
    );

  return entrySet(
    context,
    { collection, slug },
    {
      set: flags.set ?? [],
      json: flags['set-json'] ?? [],
      markdown: flags.markdown ?? []
    },
    flags.message
  );
}

async function login(flags: Flags, env: Env) {
  const url = siteOf(needed([flags.url ?? ''].filter(Boolean), 0, '--url'));
  const token = needed([flags.token ?? ''].filter(Boolean), 0, '--token');
  const api = await connect({ url, token });
  const user = await request(api.auth.me());
  const file = await saveLogin({ url, token }, env);

  return report(
    `Logged in to ${url} as ${user.name} (${user.role}); saved in ${file}`,
    {
      url,
      name: user.name,
      role: user.role
    }
  );
}

async function run(argv: string[], env: Env) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true
  });
  const [name, ...args] = positionals;

  if (name === undefined || values.help) return report(HELP, { help: HELP });

  if (name === 'login') return login(values, env);

  const command = COMMANDS.get(name);

  if (!command)
    throw new CliFailure(
      'BadArgument',
      `Unknown command ${name}: see \`venda --help\``
    );

  const saved = await currentLogin(env);

  return command({ api: await connect(saved), site: saved.url }, args, values);
}

const line = (text: string) => (text.endsWith('\n') ? text : `${text}\n`);

/** Where a run prints: its answer, and failures in words. */
export interface Output {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** Runs one command line; resolves to its exit code. */
export async function main(argv: string[], env: Env, output: Output) {
  const json = argv.includes('--json');

  try {
    const answer = await run(argv, env);

    output.out(line(json ? answer.json : answer.text));

    return 0;
  } catch (error) {
    const failure =
      error instanceof CliFailure
        ? error
        : new CliFailure(
            'Failed',
            error instanceof Error ? error.message : String(error)
          );

    if (json)
      output.out(
        line(
          JSON.stringify(
            {
              error: failure.tag,
              message: failure.message,
              path: failure.path
            },
            null,
            2
          )
        )
      );
    else output.err(line(`venda: ${failure.message}`));

    return 1;
  }
}
