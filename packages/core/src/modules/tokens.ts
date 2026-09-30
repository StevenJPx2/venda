import { createApiToken, toApiToken } from '../auth/api-tokens';
import { isCapability, type Capability } from '../auth/permissions';
import type { RequestContext } from '../context';
import { HttpError, json, readJson } from '../http';
import { route } from '../router';
import { requiredString } from '../validation';

const MAX_TOKEN_DAYS = 365;

function scopesInput(value: unknown, allowed: ReadonlySet<Capability>): Capability[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'Choose at least one scope');
  const scopes = [...new Set(value)];
  const unknown = scopes.find(scope => !isCapability(scope));
  if (unknown !== undefined) throw new HttpError(400, `Unknown scope ${String(unknown)}`);
  const valid = scopes.filter(isCapability);
  const exceeding = valid.find(scope => !allowed.has(scope));
  if (exceeding) throw new HttpError(403, `Your role does not grant ${exceeding}`);
  return valid;
}

function expiryInput(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_TOKEN_DAYS) throw new HttpError(400, `expiresInDays must be between 1 and ${MAX_TOKEN_DAYS}`);
  return new Date(Date.now() + value * 24 * 60 * 60 * 1000).toISOString();
}

async function listTokens(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const rows = await ctx.services.config.db.all('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', actor.user.id);
  return json(rows.map(toApiToken));
}

async function createToken(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  // Tokens cannot mint tokens; creation needs an interactive session.
  if (actor.via.kind === 'token') throw new HttpError(403, 'API tokens cannot create other tokens');
  const body = await readJson(ctx.request);
  const name = requiredString(body, 'name').trim().slice(0, 80);
  const scopes = scopesInput(body.scopes, actor.capabilities);
  const { token, secret } = await createApiToken(ctx.services.config.db, { userId: actor.user.id, name, scopes, expiresAt: expiryInput(body.expiresInDays) });
  return json({ token, secret }, { status: 201 });
}

async function deleteToken(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  await ctx.services.config.db.run('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', ctx.params.id ?? '', actor.user.id);
  return json({ ok: true });
}

export const tokenRoutes = [
  route('GET', '/api/tokens', listTokens),
  route('POST', '/api/tokens', createToken),
  route('DELETE', '/api/tokens/:id', deleteToken)
];
