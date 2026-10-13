// Which site the CLI talks to, and with which API token: saved by `venda
// login` in the user's config directory (readable by them only), or given by
// VENDA_URL and VENDA_TOKEN, which win.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Schema } from 'effect';
import { CliFailure } from './failure';

const SavedLogin = Schema.Struct({
  url: Schema.String,
  token: Schema.String
});

export type Login = typeof SavedLogin.Type;

export type Env = Readonly<Record<string, string | undefined>>;

const decodeLogin = Schema.decodeUnknownSync(Schema.fromJsonString(SavedLogin));

const loginFile = (env: Env) =>
  join(
    env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'venda',
    'login.json'
  );

/** A site's address without a trailing slash, so it compares equal however it was typed. */
export const siteOf = (url: string) => new URL(url).href.replace(/\/+$/, '');

export async function saveLogin(login: Login, env: Env) {
  const file = loginFile(env);

  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(login, null, 2)}\n`, { mode: 0o600 });

  return file;
}

export async function currentLogin(env: Env): Promise<Login> {
  const saved = await readFile(loginFile(env), 'utf8').then(
    decodeLogin,
    () => null
  );
  const url = env.VENDA_URL ?? saved?.url;
  const token = env.VENDA_TOKEN ?? saved?.token;

  if (url === undefined || token === undefined)
    throw new CliFailure(
      'NotLoggedIn',
      'Not logged in: run `venda login --url <site> --token <API token>`, or set VENDA_URL and VENDA_TOKEN'
    );

  return { url: siteOf(url), token };
}
