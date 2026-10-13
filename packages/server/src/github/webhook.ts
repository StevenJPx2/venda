// A GitHub webhook delivery, checked before anything changes: the body is
// bounded, its HMAC-SHA256 signature verified in constant time, and only a
// push to the configured repository and branch counts. A delivery only asks
// for a sync; the sync reads the branch itself, so a late, repeated or
// out-of-order delivery is harmless.
import { Option, Schema } from 'effect';
import { boundedBody } from '../content-limit';
import type { GitHubConfig } from './config';

/** GitHub's own cap on webhook payloads. */
const MAX_DELIVERY_BYTES = 25 * 1024 * 1024;

const encoder = new TextEncoder();

const Push = Schema.Struct({
  ref: Schema.String,
  repository: Schema.Struct({ id: Schema.Number })
});

/** What to do with a delivery: refuse it, acknowledge and ignore it, or sync. */
export type Delivery = 'refused' | 'ignored' | 'push';

const hexBytes = (hex: string) =>
  /^(?:[0-9a-f]{2})+$/.test(hex)
    ? Uint8Array.from(hex.match(/../g) ?? [], pair => Number.parseInt(pair, 16))
    : null;

/** Whether `header` (`sha256=<hex>`) signs `body` with `secret`. */
export async function signed(
  secret: string,
  body: Uint8Array<ArrayBuffer>,
  header: string | null
): Promise<boolean> {
  const signature = header?.startsWith('sha256=')
    ? hexBytes(header.slice(7))
    : null;

  if (signature === null || signature.byteLength !== 32) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, signature, body);
}

/** Whether a verified push is to this repository's configured branch. */
export function pushHere(config: GitHubConfig, body: Uint8Array): boolean {
  const push = Schema.decodeUnknownOption(Schema.fromJsonString(Push))(
    new TextDecoder().decode(body)
  );

  return Option.exists(
    push,
    each =>
      each.repository.id === config.repositoryId &&
      each.ref === `refs/heads/${config.branch}`
  );
}

export async function readDelivery(
  config: GitHubConfig,
  request: Request
): Promise<Delivery> {
  if (request.method !== 'POST' || !request.body) return 'refused';

  const body = await boundedBody(request.body, MAX_DELIVERY_BYTES);

  if (
    body === null ||
    !(await signed(
      config.webhookSecret,
      body,
      request.headers.get('x-hub-signature-256')
    ))
  )
    return 'refused';

  return request.headers.get('x-github-event') === 'push' &&
    pushHere(config, body)
    ? 'push'
    : 'ignored';
}
