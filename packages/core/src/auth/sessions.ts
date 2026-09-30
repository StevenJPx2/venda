import type { KeyValue } from '../runtime';
import { hmac, randomToken, secretsMatch } from './crypto';
import type { User } from './users';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const COOKIE = 'venda_session';

/** Where sessions live and the key that signs their cookies. */
export interface SessionStore { kv: KeyValue; secret: string }

interface SessionRecord { userId: string; version: number }

function isSessionRecord(value: unknown): value is SessionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && typeof record.version === 'number';
}

/** Creates a session for `user` and returns the Set-Cookie value. */
export async function startSession(user: User, store: SessionStore): Promise<string> {
  const token = randomToken();
  const record: SessionRecord = { userId: user.id, version: user.sessionVersion };
  await store.kv.put(`session:${token}`, JSON.stringify(record), { ttlSeconds: SESSION_TTL_SECONDS });
  return `${COOKIE}=${token}.${await hmac(token, store.secret)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

/** The session token from a correctly signed cookie, or null. */
async function verifiedToken(request: Request, store: SessionStore): Promise<string | null> {
  const cookie = request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
  const [token, signature, extra] = cookie?.split('.') ?? [];
  if (!token || !signature || extra !== undefined) return null;
  return (await secretsMatch(signature, await hmac(token, store.secret))) ? token : null;
}

/** The session's user id and version; the caller checks them against the user row. */
export async function readSession(request: Request, store: SessionStore): Promise<SessionRecord | null> {
  const token = await verifiedToken(request, store);
  if (!token) return null;
  const raw = await store.kv.get(`session:${token}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSessionRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Deletes the session server-side so a copied cookie stops working. */
export async function endSession(request: Request, store: SessionStore): Promise<void> {
  const token = await verifiedToken(request, store);
  if (token) await store.kv.delete(`session:${token}`);
}

export const expiredSessionCookie = `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
