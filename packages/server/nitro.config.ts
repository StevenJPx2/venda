import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Dependencies of @venda/content, resolved as it sees them.
const fromContent = createRequire(here('../content/package.json'));

// The content folder built into the Worker (until the GitHub store). Local
// development serves a live folder instead, through VENDA_CONTENT_URL.
const CONTENT_DIR = resolve(process.env.VENDA_CONTENT_DIR ?? 'content');

export default defineConfig({
  preset: 'cloudflare_module',
  compatibilityDate: '2026-09-22',
  serverDir: './server',
  // VENDA_OUTPUT_DIR gives a long-running caller (`pnpm try`) its own output, so another build cannot pull files from under it.
  output: { dir: process.env.VENDA_OUTPUT_DIR ?? '.output' },
  alias: {
    // yaml's Node build loads `process` with require(), which workerd cannot do; its ESM browser build has no Node imports.
    yaml: join(
      dirname(fromContent.resolve('yaml/package.json')),
      'browser/index.js'
    )
  },
  // Nuxt's build is already based at /admin/. Unmatched deep links reach the shell handler.
  publicAssets: [
    { dir: here('../../apps/admin/dist'), baseURL: '/admin', fallthrough: true }
  ],
  // drizzle-kit's migrations, applied at startup.
  serverAssets: [
    { baseName: 'migrations', dir: here('../core/drizzle') },
    { baseName: 'content', dir: CONTENT_DIR }
  ],
  // The minute check that catches the index up with a repository whose
  // webhook was missed (server/tasks/venda/tick.ts); a Cron Trigger on Workers.
  experimental: { tasks: true },
  scheduledTasks: { '* * * * *': ['venda:tick'] },
  // `kv` holds sessions and sign-in attempts.
  storage: { kv: { driver: 'cloudflare-kv-binding', binding: 'VENDA_KV' } },
  cloudflare: {
    deployConfig: true,
    nodeCompat: true,
    wrangler: {
      name: 'venda',
      compatibility_flags: ['nodejs_compat'],
      // Local `wrangler dev` creates the database by binding name; installs write their own ID.
      d1_databases: [
        { binding: 'VENDA_DB', database_name: 'venda', database_id: 'local' }
      ],
      kv_namespaces: [{ binding: 'VENDA_KV', id: 'local' }]
    }
  }
});
