// CORS policy. Public delivery reads are open to any origin without
// credentials; admin endpoints only accept origins listed in ADMIN_ORIGINS.
// A single-Worker install (admin + API on one origin) needs no admin origins.

const PUBLIC_READ = /^\/api\/(content|media)\/|^\/api\/health$/;

export function allowedAdminOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map(origin => origin.trim().replace(/\/+$/, '')).filter(Boolean));
}

export function isPublicRead(method: string, path: string): boolean {
  return (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') && PUBLIC_READ.test(path);
}

/** Headers to add to a response (or preflight) for this request, or null for none. */
export function corsHeaders(method: string, path: string, origin: string | null, adminOrigins: Set<string>): Record<string, string> | null {
  if (!origin) return null;

  if (isPublicRead(method, path)) {
    return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS' };
  }

  if (!adminOrigins.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    Vary: 'Origin'
  };
}
