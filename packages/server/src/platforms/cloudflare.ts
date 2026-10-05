// Cloudflare Workers: D1, R2 and KV bindings, and the Cron Trigger. Bindings
// are looked up by name per event (Nitro sets them on every fetch and
// scheduled event), so nothing here holds a binding. Content is the folder
// bundled at build time (VENDA_CONTENT_DIR) until the GitHub store arrives.
import { createDatabase } from 'db0';
import cloudflareD1 from 'db0/connectors/cloudflare-d1';
import { useStorage } from 'nitro/storage';
import { createStorage } from 'unstorage';
import cloudflareKv from 'unstorage/drivers/cloudflare-kv-binding';
import cloudflareR2 from 'unstorage/drivers/cloudflare-r2-binding';
import { db0Database } from '../database';
import type { Platform } from '../platform';
import { keyValue, objectStore } from '../storage';

export const BINDINGS = { db: 'VENDA_DB', media: 'VENDA_MEDIA', cache: 'VENDA_CACHE' } as const;

export const platform: Platform = {
  async services() {
    const index = createDatabase(cloudflareD1({ bindingName: BINDINGS.db }));

    return {
      db: db0Database(index),
      index,
      storage: objectStore(createStorage({ driver: cloudflareR2({ binding: BINDINGS.media }) }), { nativeContentType: true }),
      kv: keyValue(createStorage({ driver: cloudflareKv({ binding: BINDINGS.cache }) })),
      // Empty when nothing was bundled.
      content: { storage: useStorage('assets:content') }
    };
  },
  schedule(hooks, run) {
    hooks.hook('cloudflare:scheduled', run);
  }
};
