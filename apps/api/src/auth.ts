const SESSION_TTL = 60 * 60 * 24 * 7;

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function createSession(email: string, env: Env): Promise<string> {
  const token = `${crypto.randomUUID()}.${Date.now()}`;
  const signature = await digest(token, env.SESSION_SECRET);
  await env.VENDA_CACHE.put(`session:${token}`, email, { expirationTtl: SESSION_TTL });
  return `${token}.${signature}`;
}

export async function sessionEmail(request: Request, env: Env): Promise<string | null> {
  const cookie = request.headers.get('Cookie')?.match(/venda_session=([^;]+)/)?.[1];
  if (!cookie) return null;
  const pieces = cookie.split('.');
  if (pieces.length !== 3) return null;
  const token = `${pieces[0]}.${pieces[1]}`;
  const expected = await digest(token, env.SESSION_SECRET);
  if (pieces[2] !== expected) return null;
  return env.VENDA_CACHE.get(`session:${token}`);
}

export function sessionCookie(value: string): string { return `venda_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`; }
export const expiredCookie = 'venda_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

import type { Env } from './types';
