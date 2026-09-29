// Cloudflare Workers host for Venda: binds D1, R2 and KV to the core.
import { createVenda } from '@venda/core';
import { d1, kv, r2 } from '@venda/core/cloudflare';
import type { Env } from './types';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const venda = createVenda({
      db: d1(env.VENDA_DB),
      storage: r2(env.VENDA_MEDIA),
      kv: kv(env.VENDA_CACHE),
      admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      sessionSecret: env.SESSION_SECRET,
      ...(env.ADMIN_ORIGINS ? { adminOrigins: env.ADMIN_ORIGINS } : {}),
      ...(env.VENDA_VERSION ? { version: env.VENDA_VERSION } : {}),
      ...(env.ASSETS ? { assets: (req: Request) => env.ASSETS!.fetch(req) } : {})
    });
    return venda.fetch(request);
  }
};
