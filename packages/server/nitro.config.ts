import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

// NITRO_PRESET picks the target (Nitro reads it too); Cloudflare Workers by default.
const preset = process.env.NITRO_PRESET ?? 'cloudflare_module';

const onCloudflare = preset.startsWith('cloudflare');

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Dependencies of @venda/content, resolved as it sees them.
const fromContent = createRequire(here('../content/package.json'));

// The content folder: bundled into Workers at build time (until the GitHub
// store), read and watched from the working directory everywhere else.
const CONTENT_DIR = resolve(process.env.VENDA_CONTENT_DIR ?? 'content');

function aliases() {
  if (!onCloudflare) return { '#venda/target': here('./src/targets/node.ts') };

  return {
    '#venda/target': here('./src/targets/cloudflare.ts'),
    // yaml's Node build loads `process` with require(), which workerd cannot do; its ESM browser build has no Node imports.
    yaml: join(dirname(fromContent.resolve('yaml/package.json')), 'browser/index.js')
  };
}

export default defineConfig({
  preset,
  compatibilityDate: '2026-09-22',
  serverDir: './server',
  // Separate outputs, so building for Node never replaces a Workers build in use.
  output: { dir: onCloudflare ? '.output' : '.output-node' },
  alias: aliases(),
  // Nuxt's build is already based at /admin/. Unmatched deep links reach the shell handler.
  publicAssets: [{ dir: here('../../apps/admin/dist'), baseURL: '/admin', fallthrough: true }],
  // drizzle-kit's migrations, applied at startup on every runtime.
  serverAssets: [
    { baseName: 'migrations', dir: here('../core/drizzle') },
    ...(onCloudflare ? [{ baseName: 'content', dir: CONTENT_DIR }] : [])
  ],
  // `kv` holds sessions and sign-in attempts: Workers KV, or files beside the database.
  storage: onCloudflare
    ? { kv: { driver: 'cloudflare-kv-binding', binding: 'VENDA_KV' } }
    : { content: { driver: 'fs', base: './content' }, kv: { driver: 'fs', base: './.data/kv' } },
  cloudflare: {
    deployConfig: true,
    nodeCompat: true,
    wrangler: {
      name: 'venda',
      compatibility_flags: ['nodejs_compat'],
      // Local `wrangler dev` creates the database by binding name; installs write their own ID.
      d1_databases: [{ binding: 'VENDA_DB', database_name: 'venda', database_id: 'local' }],
      kv_namespaces: [{ binding: 'VENDA_KV', id: 'local' }]
    }
  }
});
