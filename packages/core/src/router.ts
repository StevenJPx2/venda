import type { RequestContext } from './context';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type RouteHandler = (ctx: RequestContext) => Promise<Response>;

/**
 * `pattern` segments are literals, `:name` (one segment) or a final `*name`
 * (the rest of the path, decoded).
 */
export interface Route {
  method: Method;
  pattern: string;
  handler: RouteHandler;
}

export const route = (method: Method, pattern: string, handler: RouteHandler): Route => ({ method, pattern, handler });

type Segment = { kind: 'literal'; value: string } | { kind: 'param'; name: string } | { kind: 'rest'; name: string };

interface CompiledRoute extends Route { segments: Segment[] }

function compile(pattern: string): Segment[] {
  return pattern.split('/').filter(Boolean).map((part): Segment => {
    if (part.startsWith(':')) return { kind: 'param', name: part.slice(1) };
    if (part.startsWith('*')) return { kind: 'rest', name: part.slice(1) };
    return { kind: 'literal', value: part };
  });
}

function matchSegments(segments: Segment[], parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [index, segment] of segments.entries()) {
    if (segment.kind === 'rest') {
      const rest = parts.slice(index);
      if (!rest.length) return null;
      params[segment.name] = rest.map(decodeURIComponent).join('/');
      return params;
    }
    const part = parts[index];
    if (part === undefined) return null;
    if (segment.kind === 'literal' && segment.value !== part) return null;
    if (segment.kind === 'param') params[segment.name] = decodeURIComponent(part);
  }
  return segments.length === parts.length ? params : null;
}

export type RouteMatch = { kind: 'found'; handler: RouteHandler; params: Record<string, string> } | { kind: 'method-not-allowed' } | { kind: 'not-found' };

export function createRouter(routes: Route[]) {
  const compiled: CompiledRoute[] = routes.map(r => ({ ...r, segments: compile(r.pattern) }));

  return {
    match(method: string, path: string): RouteMatch {
      const parts = path.split('/').filter(Boolean);
      let pathMatched = false;
      for (const candidate of compiled) {
        const params = matchSegments(candidate.segments, parts);
        if (!params) continue;
        if (candidate.method === method) return { kind: 'found', handler: candidate.handler, params };
        pathMatched = true;
      }
      return pathMatched ? { kind: 'method-not-allowed' } : { kind: 'not-found' };
    }
  };
}
