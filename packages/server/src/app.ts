// Composition root: one Venda app per isolate or process. Requests for paths
// in the contract go to the Effect API; everything else to the legacy core.
import { createVenda, type VendaConfig } from '@venda/core';
import { Layer } from 'effect';
import { BuildInfo, contractPaths, toApiHandler } from './api';
import { decodeServerEnv, type RawEnv, type ServerEnv } from './env';
import type { Platform } from './platform';

export interface VendaApp {
  fetch(request: Request): Promise<Response>;
  scheduled(): Promise<void>;
}

async function build(platform: Platform, env: ServerEnv): Promise<VendaApp> {
  const services = await platform.services(env);

  const config: VendaConfig = {
    ...services,
    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    sessionSecret: env.SESSION_SECRET
  };

  if (env.ADMIN_ORIGINS !== undefined) config.adminOrigins = env.ADMIN_ORIGINS;

  if (env.VENDA_VERSION !== undefined) config.version = env.VENDA_VERSION;

  const legacy = createVenda(config);
  const api = toApiHandler(Layer.succeed(BuildInfo, { version: env.VENDA_VERSION ?? 'dev' }));

  return {
    fetch(request) {
      const isContract = request.method === 'GET' && contractPaths.has(new URL(request.url).pathname);

      return isContract ? api.handler(request) : legacy.fetch(request);
    },
    async scheduled() {
      await legacy.scheduled();
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
