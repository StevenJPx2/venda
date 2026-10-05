// Cloudflare Workers: D1, R2 and KV bindings, and the Cron Trigger. Bindings
// are looked up by name per event (Nitro sets them on every fetch and
// scheduled event), so nothing here holds a binding.
import { createDatabase } from 'db0';
import cloudflareD1 from 'db0/connectors/cloudflare-d1';
import { createStorage } from 'unstorage';
import cloudflareKv from 'unstorage/drivers/cloudflare-kv-binding';
import cloudflareR2 from 'unstorage/drivers/cloudflare-r2-binding';
import { db0Database } from '../database';
import type { Platform } from '../platform';
import { keyValue, objectStore } from '../storage';

export const BINDINGS = { db: 'VENDA_DB', media: 'VENDA_MEDIA', cache: 'VENDA_CACHE' } as const;

export const platform: Platform = {
  async services() {
    return {
      db: db0Database(createDatabase(cloudflareD1({ bindingName: BINDINGS.db }))),
      storage: objectStore(createStorage({ driver: cloudflareR2({ binding: BINDINGS.media }) }), { nativeContentType: true }),
      kv: keyValue(createStorage({ driver: cloudflareKv({ binding: BINDINGS.cache }) }))
    };
  },
  schedule(hooks, run) {
    hooks.hook('cloudflare:scheduled', run);
  }
};
