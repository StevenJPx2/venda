import { parseArgs } from 'node:util';

export interface Flags {
  command: string | undefined;
  positionals: string[];
  dir: string;
  noPrompt: boolean;
  yes: boolean;
  help: boolean;
  version: boolean;
  account?: string;
  name?: string;
  email?: string;
  domain?: string;
  sample?: boolean;
  password?: string;
  output?: string;
  keepData: boolean;
  signOutEveryone: boolean;
}

const OPTIONS = {
  dir: { type: 'string', short: 'd' },
  'no-prompt': { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  account: { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  domain: { type: 'string' },
  sample: { type: 'boolean' },
  'no-sample': { type: 'boolean' },
  password: { type: 'string' },
  output: { type: 'string', short: 'o' },
  'keep-data': { type: 'boolean' },
  'sign-out-everyone': { type: 'boolean' }
} as const;

/** Parses argv; unknown flags are rejected so typos never silently do nothing. */
export function parseFlags(argv: string[]): Flags {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  const [command, ...rest] = positionals;

  const flags: Flags = {
    command,
    positionals: rest,
    dir: values.dir ?? process.cwd(),
    noPrompt: values['no-prompt'] === true || !process.stdin.isTTY,
    yes: values.yes === true,
    help: values.help === true,
    version: values.version === true,
    keepData: values['keep-data'] === true,
    signOutEveryone: values['sign-out-everyone'] === true
  };

  if (values.account !== undefined) flags.account = values.account;
  if (values.name !== undefined) flags.name = values.name;
  if (values.email !== undefined) flags.email = values.email;
  if (values.domain !== undefined) flags.domain = values.domain;
  if (values.password !== undefined) flags.password = values.password;
  if (values.output !== undefined) flags.output = values.output;
  if (values.sample) flags.sample = true;
  if (values['no-sample']) flags.sample = false;

  return flags;
}
