// One rebuild at a time. Changes during a build become one follow-up build;
// a failed build never installs its output.
import { watch } from 'node:fs';
import { relative, sep } from 'node:path';

const ADMIN = new Set([
  'admin',
  'editor-form',
  'editor-kit',
  'editor-writer',
  'fields-core',
  'pages-core',
  'preset-default',
  'views-core'
]);
const SHARED = new Set(['content', 'contract', 'richtext']);
const IGNORED =
  /(^|\/)(node_modules|dist|\.nuxt|\.output|\.wrangler|test)(\/|$)/;

/** Which output depends on a source file. Content fixtures stay in D1. */
export function affected(path) {
  const parts = path.split('/');

  if (IGNORED.test(path)) return [];
  // macOS also reports parent-directory metadata changes when a build writes
  // generated files. Those are not source changes and must not start a loop.
  if (!/\.(vue|ts|js|mjs|css|html|json|jsonc|sql|yaml|yml)$/.test(path))
    return [];
  if (['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(path))
    return ['admin', 'server', 'cli'];
  if (path.startsWith('try/') && !path.startsWith('try/content/'))
    return ['pages'];
  if (path.startsWith('apps/admin/')) return ['admin', 'server'];
  if (parts[0] !== 'packages') return [];
  if (SHARED.has(parts[1])) return ['admin', 'server', 'cli'];
  if (ADMIN.has(parts[1])) return ['admin', 'server'];
  if (parts[1] === 'cli') return ['cli'];
  if (['core', 'server'].includes(parts[1])) return ['server'];

  return [];
}

/** Debounced queue, including files changed while the build runs. */
export function rebuildQueue(build, failed, delay = 250) {
  const pending = new Set();
  let timer;
  let running;
  let closed = false;

  async function drain() {
    if (closed || running || pending.size === 0) return;

    const changes = new Set(pending);

    pending.clear();
    running = Promise.resolve()
      .then(() => build(changes))
      .catch(failed);
    await running;
    running = undefined;

    if (!closed && pending.size) timer = setTimeout(drain, delay);
  }

  return {
    add(kinds) {
      if (closed || kinds.length === 0) return;

      for (const kind of kinds) pending.add(kind);

      clearTimeout(timer);
      timer = setTimeout(drain, delay);
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      pending.clear();
      await running;
    }
  };
}

/** Watch only source trees, not generated builds, local data or test probes. */
export function watchSources(root, queue) {
  const watchers = ['apps/admin', 'packages', 'try'].map(dir =>
    watch(`${root}/${dir}`, { recursive: true }, (_event, file) => {
      if (!file) return;

      const path = relative(root, `${root}/${dir}/${file}`)
        .split(sep)
        .join('/');

      queue.add(affected(path));
    })
  );
  watchers.push(
    watch(root, (_event, file) => {
      if (file) queue.add(affected(String(file)));
    })
  );

  return () => watchers.forEach(watcher => watcher.close());
}
