import { fileURLToPath } from 'node:url';
import { defineConfig } from 'nitro';

// NITRO_PRESET picks the target (Nitro reads it too); Cloudflare Workers by default.
const preset = process.env.NITRO_PRESET ?? 'cloudflare_module';

const onNode = preset === 'node' || preset === 'node_server';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Placeholder IDs: local `wrangler dev` creates resources by binding name. Real
// installs get their IDs from the CLI, which writes its own wrangler config.
const LOCAL = 'local';

export default defineConfig({
  preset,
  compatibilityDate: '2026-09-22',
  serverDir: './server',
  // Separate outputs, so building for Node never replaces a Workers build in use.
  output: { dir: onNode ? '.output-node' : '.output' },
  alias: { '#venda/platform': here(onNode ? './src/platforms/node.ts' : './src/platforms/cloudflare.ts') },
  serverAssets: onNode ? [{ baseName: 'migrations', dir: here('../core/migrations') }] : [],
  cloudflare: {
    deployConfig: true,
    nodeCompat: true,
    wrangler: {
      name: 'venda',
      compatibility_flags: ['nodejs_compat'],
      triggers: { crons: ['* * * * *'] },
      d1_databases: [{ binding: 'VENDA_DB', database_name: 'venda', database_id: LOCAL, migrations_dir: here('../core/migrations') }],
      r2_buckets: [{ binding: 'VENDA_MEDIA', bucket_name: 'venda-media' }],
      kv_namespaces: [{ binding: 'VENDA_CACHE', id: LOCAL }]
    }
  }
});
