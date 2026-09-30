import { createContext, type Services } from './context';
import { allowedAdminOrigins, corsHeaders } from './cors';
import { errorResponse, HttpError, json, withHeaders } from './http';
import { authRoutes } from './modules/auth';
import { collectionRoutes } from './modules/collections';
import { contentRoutes } from './modules/content';
import { entryRoutes } from './modules/entries';
import { invitationRoutes } from './modules/invitations';
import { lifecycleRoutes } from './modules/lifecycle';
import { mediaRoutes } from './modules/media';
import { revisionRoutes } from './modules/revisions';
import { searchRoutes } from './modules/search';
import { tokenRoutes } from './modules/tokens';
import { userRoutes } from './modules/users';
import { createRouter, route } from './router';
import type { VendaConfig } from './runtime';
import { runScheduled } from './scheduler';

/** A Venda instance: one Web-standard request handler over the configured services. */
export function createVenda(config: VendaConfig) {
  const services: Services = { config, sessions: { kv: config.kv, secret: config.sessionSecret } };
  const adminOrigins = allowedAdminOrigins(Array.isArray(config.adminOrigins) ? config.adminOrigins.join(',') : config.adminOrigins);
  const router = createRouter([
    route('GET', '/api/health', async () => json({ ok: true, version: config.version ?? 'dev' })),
    ...authRoutes,
    ...invitationRoutes,
    ...userRoutes,
    ...tokenRoutes,
    ...collectionRoutes,
    ...entryRoutes,
    ...lifecycleRoutes,
    ...revisionRoutes,
    ...searchRoutes,
    ...mediaRoutes,
    ...contentRoutes
  ]);

  async function dispatch(request: Request, url: URL): Promise<Response> {
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!path.startsWith('/api')) return config.assets ? config.assets(request) : json({ error: 'Not found' }, { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    const match = router.match(request.method, path);
    try {
      if (match.kind === 'not-found') throw new HttpError(404, 'Not found');
      if (match.kind === 'method-not-allowed') throw new HttpError(405, 'Method not allowed');
      return await match.handler(createContext(request, url, match.params, services));
    } catch (error) {
      return errorResponse(error);
    }
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const response = await dispatch(request, url);
      const cors = corsHeaders(request.method, url.pathname.replace(/\/+$/, ''), request.headers.get('Origin'), adminOrigins);
      return cors ? withHeaders(response, cors) : response;
    },
    /** Runs due background work; call it every minute (Cron Trigger, timer or job runner). */
    scheduled(now?: Date) {
      return runScheduled(config, now);
    }
  };
}

export type Venda = ReturnType<typeof createVenda>;
