import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Dependencies of @venda/content, resolved as it sees them.
const fromContent = createRequire(here('../content/package.json'));
const adminDir =
  process.env.VENDA_ADMIN_OUTPUT_DIR ?? here('../../apps/admin/dist');
// A deployed site's own Worker settings (name, account, database and KV ids,
// domains, variables), laid over the local ones below.
const site = process.env.VENDA_WRANGLER
  ? JSON.parse(readFileSync(process.env.VENDA_WRANGLER, 'utf8'))
  : {};

export default defineConfig({
  preset: 'cloudflare_module',
  compatibilityDate: '2026-09-22',
  serverDir: './server',
  // VENDA_OUTPUT_DIR gives a long-running caller (`pnpm try`) its own output, so another build cannot pull files from under it.
  output: { dir: process.env.VENDA_OUTPUT_DIR ?? '.output' },
  alias: {
    '#venda/admin-shell': join(adminDir, 'index.html'),
    // yaml's Node build loads `process` with require(), which workerd cannot do; its ESM browser build has no Node imports.
    yaml: join(
      dirname(fromContent.resolve('yaml/package.json')),
      'browser/index.js'
    )
  },
  // Nuxt's build is already based at /admin/. Unmatched deep links reach the shell handler.
  publicAssets: [{ dir: adminDir, baseURL: '/admin', fallthrough: true }],
  // drizzle-kit's migrations, applied at startup.
  serverAssets: [{ baseName: 'migrations', dir: here('../core/drizzle') }],
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
      kv_namespaces: [{ binding: 'VENDA_KV', id: 'local' }],
      ...site
    }
  }
});
