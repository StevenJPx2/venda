// Composition root: one Venda app per isolate. On first use it migrates the
// database, which holds the content and its index; requests go to the Effect
// API.
import { Owner } from '@venda/core/auth';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { BuildInfo, toApiHandler } from './api';
import { atomicWritesLayer } from './atomic-writes';
import { limitContentRequest } from './content-limit';
import { decodeServerEnv, type RawEnv } from './env';
import type { DomainServices } from './infrastructure';
import { keyValueLayer, type KeyValueMount } from './key-value';
import { migrate, type MigrationFiles, readMigrations } from './migrations';
import type { Target } from './target';

/** The Nitro storage mounts the app reads, the same on every preset. */
export interface Mounts {
  readonly migrations: MigrationFiles;
  readonly keyValue: KeyValueMount;
}

export interface VendaApp {
  fetch(request: Request): Promise<Response>;
  /** Closes the database. */
  close(): Promise<void>;
}

// Content is public; sites and CDNs may keep a read for a minute.
const PUBLIC_CACHE = 'public, max-age=60';
// The public reads: published content and the site's settings.
const PUBLIC_READ = /^\/api\/(content\/|site$)/;

async function build(
  target: Target,
  mounts: Mounts,
  env: RawEnv
): Promise<VendaApp> {
  const { VENDA_VERSION, VENDA_OWNER_EMAIL, VENDA_OWNER_PASSWORD } =
    decodeServerEnv(env);
  const owner = Layer.succeed(Owner, {
    email: VENDA_OWNER_EMAIL,
    password: Redacted.make(VENDA_OWNER_PASSWORD)
  });
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      target.database.layer,
      atomicWritesLayer(target.database).pipe(
        Layer.provide(target.database.layer)
      ),
      keyValueLayer(mounts.keyValue),
      owner
    )
  );

  await runtime.runPromise(
    migrate(target.database, await readMigrations(mounts.migrations))
  );

  const domain = await runtime.runPromise(Effect.context<DomainServices>());
  const services = Layer.mergeAll(
    Layer.succeed(BuildInfo, { version: VENDA_VERSION ?? 'dev' }),
    Layer.succeedContext(domain)
  );
  const api = toApiHandler(services);

  return {
    async fetch(request) {
      const bounded = await limitContentRequest(request);

      if (bounded instanceof Response) return bounded;

      const response = await api.handler(bounded);
      const path = new URL(request.url).pathname;

      if (PUBLIC_READ.test(path))
        // Sites on other origins read these from the browser; no cookies.
        response.headers.set('Access-Control-Allow-Origin', '*');
      if (response.ok && path.startsWith('/api/content/'))
        response.headers.set('Cache-Control', PUBLIC_CACHE);

      return response;
    },
    async close() {
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
export function appLoader(
  target: Target,
  mounts: () => Mounts,
  readEnv: () => RawEnv
): AppLoader {
  let pending: Promise<VendaApp> | undefined;

  const load = () => {
    pending ??= Promise.resolve()
      .then(() => build(target, mounts(), readEnv()))
      .catch((error: Error) => {
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
