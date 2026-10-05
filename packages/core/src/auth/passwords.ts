import { fromBase64Url, secretsMatch, toBase64Url } from './crypto';

// Cloudflare Workers cap PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000;
const MIN_LENGTH = 10;
const MAX_LENGTH = 256;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;

  return null;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toBase64Url(bits);
}

/** Encodes as `pbkdf2-sha256$<iterations>$<salt>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64Url(salt)}$${await derive(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = encoded.split('$');
  const rounds = Number(iterations);

  if (scheme !== 'pbkdf2-sha256' || !salt || !expected || !Number.isInteger(rounds) || rounds < 1 || rounds > ITERATIONS) return false;

  return secretsMatch(await derive(password.slice(0, MAX_LENGTH), fromBase64Url(salt), rounds), expected);
}

// Verified against when an email is unknown, so the response time does not reveal which accounts exist.
export const UNKNOWN_USER_HASH = `pbkdf2-sha256$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
