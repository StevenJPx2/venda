// Password hashing and secrets, with WebCrypto only so the same code runs on
// Workers and Node. Workers caps PBKDF2 at 100,000 iterations.
import { Effect } from 'effect';

const ITERATIONS = 100_000;

const encoder = new TextEncoder();

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(text.match(/../g) ?? [], pair => Number.parseInt(pair, 16));

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** A secret for a link, session or API token: 32 random bytes, URL-safe. */
export const randomSecret = Effect.sync(() => base64url(crypto.getRandomValues(new Uint8Array(32))));

/** How a secret is stored and looked up: its SHA-256, so a leaked table or KV holds no usable credential. */
export const digest = (secret: string) => Effect.promise(async () => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)))));

const derive = (password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) => Effect.promise(async () => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);

  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
});

/** `pbkdf2$<iterations>$<salt>$<hash>`, all hex. */
export const hashPassword = (password: string) => Effect.gen(function*() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = yield* derive(password, salt, ITERATIONS);

  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${hex(hash)}`;
});

/** Compares every byte whatever the input, so timing says nothing about how much matched. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;

  for (let index = 0; index < Math.max(a.length, b.length); index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);

  return difference === 0;
}

export const verifyPassword = (password: string, stored: string) => Effect.gen(function*() {
  const [scheme, iterations, salt, hash] = stored.split('$');

  if (scheme !== 'pbkdf2' || iterations === undefined || salt === undefined || hash === undefined) return false;

  return sameBytes(yield* derive(password, fromHex(salt), Number(iterations)), fromHex(hash));
});

/** Constant-time comparison of two strings, for secrets held in configuration. */
export const sameSecret = (a: string, b: string) => sameBytes(encoder.encode(a), encoder.encode(b));
