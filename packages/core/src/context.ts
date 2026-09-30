import { bearerToken, findApiToken } from './auth/api-tokens';
import { roleCapabilities, type Capability } from './auth/permissions';
import { readSession, type SessionStore } from './auth/sessions';
import { findUserById, type User } from './auth/users';
import { HttpError } from './http';
import type { VendaConfig } from './runtime';

/** Who is making a request and what they may do. */
export interface Actor {
  user: User;
  capabilities: ReadonlySet<Capability>;
  via: { kind: 'session' } | { kind: 'token'; tokenId: string };
}

export interface Services {
  config: VendaConfig;
  sessions: SessionStore;
}

export interface RequestContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  services: Services;
  /** The signed-in actor, or null. Resolved once per request. */
  actor(): Promise<Actor | null>;
  /** The actor, who must hold `capability`: 401 when signed out, 403 when not permitted. */
  require(capability?: Capability): Promise<Actor>;
}

async function sessionActor(request: Request, services: Services): Promise<Actor | null> {
  const session = await readSession(request, services.sessions);
  if (!session) return null;
  const user = await findUserById(services.config.db, session.userId);
  if (!user || user.status !== 'active' || user.sessionVersion !== session.version) return null;
  return { user, capabilities: roleCapabilities(user.role), via: { kind: 'session' } };
}

async function tokenActor(secret: string, services: Services): Promise<Actor | null> {
  const token = await findApiToken(services.config.db, secret);
  if (!token) return null;
  const user = await findUserById(services.config.db, token.userId);
  if (!user || user.status !== 'active') return null;
  // A token can never exceed its owner's current role.
  const roleCaps = roleCapabilities(user.role);
  const capabilities = new Set(token.scopes.filter(scope => roleCaps.has(scope)));
  return { user, capabilities, via: { kind: 'token', tokenId: token.id } };
}

export function createContext(request: Request, url: URL, params: Record<string, string>, services: Services): RequestContext {
  let resolved: Promise<Actor | null> | undefined;
  const actor = () => {
    if (!resolved) {
      const secret = bearerToken(request);
      resolved = secret ? tokenActor(secret, services) : sessionActor(request, services);
    }
    return resolved;
  };

  return {
    request,
    url,
    params,
    services,
    actor,
    async require(capability) {
      const current = await actor();
      if (!current) throw new HttpError(401, 'Authentication required');
      if (capability && !current.capabilities.has(capability)) throw new HttpError(403, 'You do not have permission to do that');
      return current;
    }
  };
}
