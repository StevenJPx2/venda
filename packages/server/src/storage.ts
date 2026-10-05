// The legacy core's `ObjectStore` and `KeyValue` over unstorage, so one
// adapter covers R2, KV, the filesystem and memory.
import type { KeyValue, ObjectStore } from '@venda/core';
import { Option, Schema } from 'effect';
import type { Storage } from 'unstorage';

const ObjectMeta = Schema.Struct({
  size: Schema.optional(Schema.Number),
  contentType: Schema.optional(Schema.String),
  // R2 keeps the content type with the object itself.
  httpMetadata: Schema.optional(Schema.Struct({ contentType: Schema.optional(Schema.String) }))
});

const decodeMeta = Schema.decodeUnknownOption(ObjectMeta);

function toStream(body: ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body;

  // Copied so the Blob gets a plain ArrayBuffer, whatever backed the driver's bytes.
  return new Blob([new Uint8Array(body)]).stream();
}

/**
 * Media over an unstorage mount. `nativeContentType` is true for drivers that
 * store the content type with the object (R2); other drivers get it in
 * unstorage's metadata entry beside the object.
 */
export function objectStore(storage: Storage, options: { nativeContentType: boolean }): ObjectStore {
  return {
    async put(key, body, { contentType }) {
      // Drivers take bytes, not Blobs (the core passes the uploaded File); uploads are capped at 10 MB.
      const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body;

      await storage.setItemRaw(key, bytes, { httpMetadata: { contentType } });

      if (!options.nativeContentType) await storage.setMeta(key, { contentType });
    },
    async get(key) {
      const body = await storage.getItemRaw<ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer>(key, { type: 'stream' });

      if (body === null || body === undefined) return null;

      const meta = Option.getOrUndefined(decodeMeta(await storage.getMeta(key)));
      const contentType = meta?.contentType ?? meta?.httpMetadata?.contentType;
      const stored: Awaited<ReturnType<ObjectStore['get']>> = { body: toStream(body) };

      if (meta?.size !== undefined) stored.size = meta.size;

      if (contentType !== undefined) stored.contentType = contentType;

      return stored;
    },
    async delete(key) {
      await storage.removeItem(key, { removeMeta: true });
    }
  };
}

// Expiry travels with the value: the memory and filesystem drivers have no
// TTL, and sessions and login lockouts depend on keys expiring.
const Stored = Schema.Struct({ value: Schema.String, expiresAt: Schema.optional(Schema.Number) });

const decodeStored = Schema.decodeUnknownOption(Stored);

/** Strings with optional expiry over an unstorage mount; drivers with native TTL (KV) also expire them. */
export function keyValue(storage: Storage, now: () => number = Date.now): KeyValue {
  return {
    async get(key) {
      const stored = decodeStored(await storage.getItem(key));

      if (Option.isNone(stored)) return null;

      if (stored.value.expiresAt !== undefined && stored.value.expiresAt <= now()) {
        await storage.removeItem(key);

        return null;
      }

      return stored.value.value;
    },
    async put(key, value, options) {
      const ttl = options?.ttlSeconds;

      if (ttl === undefined) return storage.setItem(key, { value });

      return storage.setItem(key, { value, expiresAt: now() + ttl * 1000 }, { ttl });
    },
    delete: key => storage.removeItem(key)
  };
}
