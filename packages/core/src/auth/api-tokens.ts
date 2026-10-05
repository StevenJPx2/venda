import type { Database, Row } from '../runtime';
import { randomToken, sha256 } from './crypto';
import { isCapability, type Capability } from './permissions';

const PREFIX = 'venda_';
// Writing last_used_at on every request would cost a database write per call.
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  scopes: Capability[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

function parseScopes(raw: unknown): Capability[] {
  try {
    const value: unknown = JSON.parse(String(raw));
    return Array.isArray(value) ? value.filter(isCapability) : [];
  } catch {
    return [];
  }
}

export function toApiToken(row: Row): ApiToken {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    scopes: parseScopes(row.scopes_json),
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null
  };
}

/** Stores a new token and returns it with its secret, which is shown only once. */
export async function createApiToken(db: Database, input: { userId: string; name: string; scopes: Capability[]; expiresAt: string | null }): Promise<{ token: ApiToken; secret: string }> {
  const secret = `${PREFIX}${randomToken()}`;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.run(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, scopes_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, input.userId, input.name, await sha256(secret), JSON.stringify(input.scopes), createdAt, input.expiresAt
  );
  return { token: { id, userId: input.userId, name: input.name, scopes: input.scopes, createdAt, expiresAt: input.expiresAt, lastUsedAt: null }, secret };
}

/** Looks up a bearer token; expired or unknown tokens resolve to null. */
export async function findApiToken(db: Database, secret: string): Promise<ApiToken | null> {
  if (!secret.startsWith(PREFIX)) return null;
  const row = await db.first('SELECT * FROM api_tokens WHERE token_hash = ?', await sha256(secret));
  if (!row) return null;
  const token = toApiToken(row);
  const now = Date.now();
  if (token.expiresAt && Date.parse(token.expiresAt) <= now) return null;

  if (!token.lastUsedAt || now - Date.parse(token.lastUsedAt) > LAST_USED_RESOLUTION_MS) {
    await db.run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', new Date(now).toISOString(), token.id);
  }

  return token;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
