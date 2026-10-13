// Reload notifications stay on the page server, which survives Worker
// restarts. Reconnecting clients compare versions, so missed events are safe.
import { randomUUID } from 'node:crypto';
export const RELOAD_CLIENT = `
(() => {
  let version;
  let edited = false;
  let notice;
  document.addEventListener('input', () => { edited = true; }, true);
  document.addEventListener('change', () => { edited = true; }, true);
  const source = new EventSource('http://localhost:8794/__try/events');
  source.onmessage = event => {
    if (version === undefined) { version = event.data; return; }
    if (version === event.data) return;
    version = event.data;
    if (!edited) { location.reload(); return; }
    if (notice) return;
    notice = document.createElement('button');
    notice.textContent = 'Code updated. Reload when your edits are saved.';
    notice.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:12px 16px;background:#18181b;color:white;border:0;border-radius:8px;cursor:pointer';
    notice.onclick = () => {
      if (confirm('Reload now? Save any unfinished edits first.')) location.reload();
    };
    document.body.append(notice);
  };
})();
`;

/** Served only by pnpm try; injected only into its builds and try pages. */
export function reloadHub(boot = randomUUID()) {
  const clients = new Set();
  let version = 0;

  return {
    events(request, response) {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin':
          request.headers.origin === 'http://127.0.0.1:8805'
            ? request.headers.origin
            : 'http://localhost:8805'
      });
      response.write(`data: ${boot}:${version}\n\n`);
      clients.add(response);
      const heartbeat = setInterval(
        () => response.write(': alive\n\n'),
        15_000
      );

      response.once('close', () => {
        clearInterval(heartbeat);
        clients.delete(response);
      });
    },
    changed() {
      version++;
      for (const client of clients)
        client.write(`data: ${boot}:${version}\n\n`);
    },
    close() {
      for (const client of clients) client.end();
      clients.clear();
    }
  };
}
