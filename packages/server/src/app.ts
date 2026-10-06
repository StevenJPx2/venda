// Composition root: one Venda app per isolate. On first use it migrates the
// database and syncs the content files into the index; where the files can
// change while it runs, every request first re-indexes any change. Requests go
// to the Effect API.
import { Owner } from '@venda/core/auth';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { BuildInfo, toApiHandler } from './api';
import { contentStoreLayer, contentSync } from './content';
import { decodeServerEnv, type RawEnv } from './env';
import type { DomainServices } from './infrastructure';
import { keyValueLayer, type KeyValueMount } from './key-value';
import { localContent } from './local-content';
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

async function build(
  target: Target,
  mounts: Mounts,
  env: RawEnv
): Promise<VendaApp> {
  const {
    VENDA_VERSION,
    VENDA_OWNER_EMAIL,
    VENDA_OWNER_PASSWORD,
    VENDA_CONTENT_URL
  } = decodeServerEnv(env);
  const content = VENDA_CONTENT_URL
    ? localContent(VENDA_CONTENT_URL)
    : target.content();
  const owner = Layer.succeed(Owner, {
    email: VENDA_OWNER_EMAIL,
    password: Redacted.make(VENDA_OWNER_PASSWORD)
  });
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      target.database.layer,
      contentStoreLayer(content.files),
      keyValueLayer(mounts.keyValue),
      owner
    )
  );

  await runtime.runPromise(
    migrate(target.database, await readMigrations(mounts.migrations))
  );

  const sync = contentSync(effect => runtime.runPromise(effect));

  // Records where the files stand, so the first request does not sync again.
  await content.changed?.();
  await sync.run();

  // Requests wait for a re-index in progress, so none answers from a stale index.
  const freshen = async () => {
    if (await content.changed?.()) void sync.run();

    await sync.settled();
  };

  const domain = await runtime.runPromise(Effect.context<DomainServices>());
  const services = Layer.mergeAll(
    Layer.succeed(BuildInfo, { version: VENDA_VERSION ?? 'dev' }),
    Layer.succeedContext(domain)
  );
  const api = toApiHandler(services);

  return {
    async fetch(request) {
      await freshen();

      const response = await api.handler(request);

      if (
        response.ok &&
        new URL(request.url).pathname.startsWith('/api/content/')
      )
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
