import type { Database, KeyValue, ObjectStore } from '@venda/core';
import type { Database as Db0 } from 'db0';
import type { ContentSource } from './content';
import type { ServerEnv } from './env';

/** What each platform module (`#venda/platform`) supplies to the server. */
export interface PlatformServices {
  db: Database;
  /** The same database for the Effect core's index. */
  index: Db0;
  storage: ObjectStore;
  kv: KeyValue;
  /** The content files, when this install has any. */
  content: ContentSource | undefined;
}

export interface Platform {
  /** Builds the services, running whatever setup the platform needs first (migrations on Node). */
  services(env: ServerEnv): Promise<PlatformServices>;
  /** Arranges for `run` to happen every minute. */
  schedule(hooks: TickHooks, run: () => Promise<void>): void;
}

/** The slice of Nitro's runtime hooks the platforms use. */
export interface TickHooks {
  hook(name: 'cloudflare:scheduled', handler: () => Promise<void>): void;
  hook(name: 'close', handler: () => void): void;
}
