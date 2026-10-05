// Composition root: one Venda app per isolate or process. Requests for paths
// in the contract go to the Effect API; everything else to the legacy core.
// Collections defined by files answer from the index; any other collection
// is not found there and falls through to the legacy core's database.
import { CollectionNotFound } from '@venda/contract';
import { createVenda, type VendaConfig } from '@venda/core';
import { Layer, Option, Schema } from 'effect';
import { BuildInfo, isContractPath, toApiHandler } from './api';
import { contentSync, indexDbLayer } from './content';
import { decodeServerEnv, type RawEnv, type ServerEnv } from './env';
import type { Platform } from './platform';

export interface VendaApp {
  fetch(request: Request): Promise<Response>;
  scheduled(): Promise<void>;
}

const decodeNotFound = Schema.decodeUnknownOption(CollectionNotFound);

async function isUnknownCollection(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;

  return Option.isSome(decodeNotFound(await response.clone().json().catch(() => null)));
}

// The legacy API's caching for public reads, kept for sites and CDNs.
const PUBLIC_CACHE = 'public, max-age=60';

async function build(platform: Platform, env: ServerEnv): Promise<VendaApp> {
  const services = await platform.services(env);

  const config: VendaConfig = {
    db: services.db,
    storage: services.storage,
    kv: services.kv,
    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    sessionSecret: env.SESSION_SECRET
  };

  if (env.ADMIN_ORIGINS !== undefined) config.adminOrigins = env.ADMIN_ORIGINS;

  if (env.VENDA_VERSION !== undefined) config.version = env.VENDA_VERSION;

  const legacy = createVenda(config);
  const api = toApiHandler(Layer.mergeAll(Layer.succeed(BuildInfo, { version: env.VENDA_VERSION ?? 'dev' }), indexDbLayer(services.index)));
  const sync = services.content === undefined ? async () => {} : contentSync(services.content, services.index);

  await sync();
  services.content?.watch?.(() => void sync());

  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;

      if (request.method !== 'GET' || !isContractPath(path)) return legacy.fetch(request);

      const response = await api.handler(request);

      if (await isUnknownCollection(response)) return legacy.fetch(request);

      if (response.ok && path.startsWith('/api/content/')) response.headers.set('Cache-Control', PUBLIC_CACHE);

      return response;
    },
    async scheduled() {
      await Promise.all([legacy.scheduled(), sync()]);
    }
  };
}

/**
 * The app for this isolate, built on first use: Cloudflare only exposes
 * variables inside an event. A failed build is not cached, so the next
 * request retries it.
 */
export function appLoader(platform: Platform, readEnv: () => RawEnv): () => Promise<VendaApp> {
  let pending: Promise<VendaApp> | undefined;

  return () => {
    // Decoding inside the chain makes a bad environment a rejection, not a throw.
    pending ??= Promise.resolve().then(() => build(platform, decodeServerEnv(readEnv()))).catch((error: Error) => {
      pending = undefined;
      throw error;
    });

    return pending;
  };
}
