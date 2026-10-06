// The core's KeyValue over the `kv` storage mount: Workers KV, or files on Node.
import { KeyValue, KeyValueError } from '@venda/core/auth';
import { Clock, Effect, Layer, Option, Predicate, Schema } from 'effect';

/** The parts of a Nitro storage mount the key-value store uses. */
export interface KeyValueMount {
  getItem(key: string): Promise<string | number | boolean | object | null>;
  setItem(key: string, value: string, options?: { ttl: number }): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Expiry travels with the value: the file driver has no TTL. KV also expires
// keys itself (it needs a TTL of at least 60 seconds).
const Stored = Schema.Struct({
  value: Schema.String,
  expiresAt: Schema.Number
});

const decodeStored = Schema.decodeUnknownOption(Schema.fromJsonString(Stored));

const KV_MIN_TTL_SECONDS = 60;

const failure = (message: string) => (cause: unknown) =>
  new KeyValueError({ message, cause });

export const keyValueLayer = (mount: KeyValueMount) =>
  Layer.succeed(KeyValue, {
    get: key =>
      Effect.gen(function* () {
        const raw = yield* Effect.tryPromise({
          try: () => mount.getItem(key),
          catch: failure(`Could not read ${key}`)
        });
        // unstorage parses JSON values on read; the file driver may hand back the object.
        const stored = decodeStored(
          Predicate.isString(raw) ? raw : JSON.stringify(raw)
        );
        const now = yield* Clock.currentTimeMillis;

        return Option.flatMap(stored, each =>
          each.expiresAt > now ? Option.some(each.value) : Option.none()
        );
      }),
    set: (key, value, ttlSeconds) =>
      Effect.gen(function* () {
        const expiresAt = (yield* Clock.currentTimeMillis) + ttlSeconds * 1000;
        const ttl = Math.max(ttlSeconds, KV_MIN_TTL_SECONDS);

        yield* Effect.tryPromise({
          try: () =>
            mount.setItem(key, JSON.stringify({ value, expiresAt }), { ttl }),
          catch: failure(`Could not write ${key}`)
        });
      }),
    remove: key =>
      Effect.tryPromise({
        try: () => mount.removeItem(key),
        catch: failure(`Could not remove ${key}`)
      })
  });
