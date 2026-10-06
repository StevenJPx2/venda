// Composition root: one Venda app per isolate or process. On first use it
// migrates the database, syncs the content files into the index and starts
// watching them where they can change; every request goes to the Effect API.
import { IndexDb } from '@venda/core/content';
import { Layer, ManagedRuntime } from 'effect';
import { BuildInfo, toApiHandler } from './api';
import { contentStoreLayer, contentSync } from './content';
import { decodeServerEnv, type RawEnv } from './env';
import { migrate, type MigrationFiles, readMigrations } from './migrations';
import type { Target } from './target';

export interface VendaApp {
  fetch(request: Request): Promise<Response>;
  /** Stops watching files and closes the database. */
  close(): Promise<void>;
}

// Content is public; sites and CDNs may keep a read for a minute.
const PUBLIC_CACHE = 'public, max-age=60';

async function build(target: Target, migrations: MigrationFiles, env: RawEnv): Promise<VendaApp> {
  const { VENDA_VERSION } = decodeServerEnv(env);
  const content = target.content();
  const runtime = ManagedRuntime.make(Layer.mergeAll(target.database.layer, contentStoreLayer(content.files)));

  await runtime.runPromise(migrate(target.database, await readMigrations(migrations)));

  const sync = contentSync(effect => runtime.runPromise(effect));

  await sync();

  const unwatch = await content.watch?.(() => void sync());

  const services = Layer.mergeAll(Layer.succeed(BuildInfo, { version: VENDA_VERSION ?? 'dev' }), Layer.succeed(IndexDb, await runtime.runPromise(IndexDb)));
  const api = toApiHandler(services);

  return {
    async fetch(request) {
      const response = await api.handler(request);

      if (response.ok && new URL(request.url).pathname.startsWith('/api/content/')) response.headers.set('Cache-Control', PUBLIC_CACHE);

      return response;
    },
    async close() {
      await unwatch?.();
      await Promise.all([runtime.dispose(), api.dispose()]);
    }
  };
}

export interface AppLoader {
  /** The app, built on first use. */
  readonly load: () => Promise<VendaApp>;
  /** Closes the app if it was built. */
  readonly close: () => Promise<void>;
}

/**
 * The app for this isolate, built on first use: Cloudflare only exposes
 * bindings inside an event. A failed build is not cached, so the next request
 * retries it.
 */
export function appLoader(target: Target, migrations: () => MigrationFiles, readEnv: () => RawEnv): AppLoader {
  let pending: Promise<VendaApp> | undefined;

  const load = () => {
    pending ??= Promise.resolve().then(() => build(target, migrations(), readEnv())).catch((error: Error) => {
      pending = undefined;
      throw error;
    });

    return pending;
  };

  const close = async () => {
    const app = await pending?.catch(() => undefined);

    pending = undefined;
    await app?.close();
  };

  return { load, close };
}
