import type { Env } from './types';

const SESSION_TTL = 60 * 60 * 24 * 7;

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

/** Constant-time string comparison, so response timing never reveals how much of a secret matched. */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  // Hash both sides first: equal-length digests make the byte loop independent of input length.
  const [a, b] = await Promise.all([given, expected].map(value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
  const left = new Uint8Array(a!);
  const right = new Uint8Array(b!);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

export async function createSession(email: string, env: Env): Promise<string> {
  const token = `${crypto.randomUUID()}.${Date.now()}`;
  const signature = await digest(token, env.SESSION_SECRET);
  await env.VENDA_CACHE.put(`session:${token}`, email, { expirationTtl: SESSION_TTL });
  return `${token}.${signature}`;
}

/** The verified session token from the cookie, or null when absent or forged. */
async function sessionToken(request: Request, env: Env): Promise<string | null> {
  const cookie = request.headers.get('Cookie')?.match(/venda_session=([^;]+)/)?.[1];
  if (!cookie) return null;
  const pieces = cookie.split('.');
  if (pieces.length !== 3) return null;
  const token = `${pieces[0]}.${pieces[1]}`;
  return (await secretsMatch(pieces[2]!, await digest(token, env.SESSION_SECRET))) ? token : null;
}

export async function sessionEmail(request: Request, env: Env): Promise<string | null> {
  const token = await sessionToken(request, env);
  return token ? env.VENDA_CACHE.get(`session:${token}`) : null;
}

/** Revokes the session server-side so a copied cookie stops working after logout. */
export async function destroySession(request: Request, env: Env): Promise<void> {
  const token = await sessionToken(request, env);
  if (token) await env.VENDA_CACHE.delete(`session:${token}`);
}

export function sessionCookie(value: string): string { return `venda_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`; }
export const expiredCookie = 'venda_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
