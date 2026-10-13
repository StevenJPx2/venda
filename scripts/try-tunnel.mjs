// A public address for `pnpm try`: a remotely managed Cloudflare Tunnel whose
// routes send one hostname to the Worker and one to the try pages. Its token
// and hostnames come from the git-ignored .try-tunnel.json (README), so the
// addresses stay the same from run to run. Anyone can open them; the try
// page server's helpers that act on this machine answer only on localhost.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The tunnel's settings, or why there are none. */
export function tunnelConfig(text, home) {
  if (text === undefined)
    return { note: 'no .try-tunnel.json (see the README to add one)' };

  const config = JSON.parse(text);
  const valid =
    typeof config.tokenFile === 'string' &&
    URL.canParse(config.worker) &&
    URL.canParse(config.pages);

  if (!valid)
    return {
      note: '.try-tunnel.json needs tokenFile, worker and pages (see the README)'
    };

  return {
    tokenFile: config.tokenFile.replace(/^~(?=\/)/, home),
    worker: new URL(config.worker).origin,
    pages: new URL(config.pages).origin
  };
}

/** cloudflared's line for a connection to Cloudflare's edge: the tunnel is serving. */
export const connected = text => /Registered tunnel connection/.test(text);

/** Starts cloudflared; resolves once it serves, or false after `seconds`. */
function runTunnel(host, tokenFile, seconds = 45) {
  const child = host.start(
    'tunnel',
    'cloudflared',
    ['tunnel', '--no-autoupdate', 'run'],
    // The token stays out of the process list.
    { TUNNEL_TOKEN_FILE: tokenFile }
  );

  return new Promise(done => {
    let recent = '';
    const finish = ok => {
      clearTimeout(timer);
      done(ok);
    };
    const timer = setTimeout(() => finish(false), seconds * 1000);
    const read = chunk => {
      recent = (recent + chunk).slice(-4096);

      if (connected(recent)) finish(true);
    };

    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.done.then(
      () => finish(false),
      () => finish(false)
    );
  });
}

/** Opens the tunnel from `root`/.try-tunnel.json, or says why not. Never throws. */
export async function openTunnel(host, root) {
  const config = tunnelConfig(
    await readFile(join(root, '.try-tunnel.json'), 'utf8').catch(
      () => undefined
    ),
    homedir()
  );

  if (config.note) return config;

  return (await runTunnel(host, config.tokenFile))
    ? config
    : { note: 'cloudflared did not connect (see .try/tunnel.log)' };
}

/** The try pages' local Worker address, as a visitor through the tunnel must reach it. */
export function forVisitor(html, hostHeader, tunnel, localWorker) {
  const throughTunnel =
    tunnel?.pages && hostHeader === new URL(tunnel.pages).host;

  return throughTunnel ? html.replaceAll(localWorker, tunnel.worker) : html;
}

/** The page server's helpers that act on this machine: the CLI, files, the compiler. */
const MACHINE = /^\/(cli|files)\/|^\/compile-mistakes$/;

/** Whether `path` must be refused to a request that did not come from this machine. */
export const localOnly = (path, hostHeader) =>
  MACHINE.test(path) &&
  !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostHeader ?? '');
