// Quick tunnels for `pnpm try` (developers.cloudflare.com/tunnel/get-started/
// quick-tunnels): a trycloudflare.com URL for the Worker and one for the try
// pages. The try owner's password is public, so each tunnel is behind
// Cloudflare's email one-time PIN (--allowed-mail); without an allowed
// address, no tunnel starts. Quick tunnels carry no Server-Sent Events, so
// hot reload stays on localhost.
import { execFile } from 'node:child_process';

// The quick-tunnel API host appears in cloudflared's error messages; it is
// never a tunnel's own address.
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;

/** The tunnel's address in cloudflared's output, once it has printed one. */
export const tunnelUrl = text => TUNNEL_URL.exec(text)?.[0];

/** Who may open the tunnels: VENDA_TRY_TUNNEL_EMAILS, comma-separated, else the git user's email. */
export function allowedEmails(env, gitEmail) {
  const listed = (env.VENDA_TRY_TUNNEL_EMAILS ?? gitEmail ?? '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);

  return [...new Set(listed)];
}

export const tunnelArgs = (port, emails) => [
  'tunnel',
  '--no-autoupdate',
  '--url',
  `http://localhost:${port}`,
  ...emails.flatMap(email => ['--allowed-mail', email])
];

const output = (command, args, cwd) =>
  new Promise(done =>
    execFile(command, args, { cwd }, (error, out) =>
      done(error ? undefined : out.trim())
    )
  );

/** Starts one tunnel; resolves to its URL, or undefined if none comes within `seconds`. */
function openTunnel(host, name, port, emails, seconds = 45) {
  const child = host.start(
    `tunnel-${name}`,
    'cloudflared',
    tunnelArgs(port, emails)
  );

  return new Promise(done => {
    let recent = '';
    const finish = url => {
      clearTimeout(timer);
      done(url);
    };
    const timer = setTimeout(() => finish(undefined), seconds * 1000);
    // The address is printed once, early; only the last few KB are kept.
    const read = chunk => {
      recent = (recent + chunk).slice(-4096);

      const url = tunnelUrl(recent);

      if (url) finish(url);
    };

    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.done.then(
      () => finish(undefined),
      () => finish(undefined)
    );
  });
}

/**
 * Opens a tunnel to each of `ports` ({ worker, page }), or says why none
 * opened. Never throws: `pnpm try` runs the same without them.
 */
export async function openTunnels(host, root, env, ports) {
  if ((await output('cloudflared', ['--version'], root)) === undefined)
    return {
      note: 'cloudflared is not installed (brew install cloudflared); pass --no-tunnel to skip'
    };

  const emails = allowedEmails(
    env,
    await output('git', ['config', 'user.email'], root)
  );

  if (emails.length === 0)
    return {
      note: 'no one to allow in: set VENDA_TRY_TUNNEL_EMAILS or git config user.email'
    };

  const [worker, page] = await Promise.all([
    openTunnel(host, 'worker', ports.worker, emails),
    openTunnel(host, 'page', ports.page, emails)
  ]);

  return { worker, page, emails };
}

/** The try pages' local Worker address, as a visitor through the page tunnel must reach it. */
export function forVisitor(html, hostHeader, tunnels, localWorker) {
  const throughTunnel =
    tunnels?.page &&
    tunnels.worker &&
    hostHeader === new URL(tunnels.page).host;

  return throughTunnel ? html.replaceAll(localWorker, tunnels.worker) : html;
}
