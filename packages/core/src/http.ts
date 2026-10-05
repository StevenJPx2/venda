/** An expected failure with the HTTP status and message the client receives. */
export class HttpError extends Error {
  override name = 'HttpError';
  constructor(readonly status: number, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...init.headers } });
}

export function withHeaders(response: Response, headers: Record<string, string>, append = false): Response {
  const merged = new Headers(response.headers);

  for (const [name, value] of Object.entries(headers)) {
    if (append) merged.append(name, value);
    else merged.set(name, value);
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

/** Parses a JSON object body; anything else is a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'Request body must be a JSON object');
  return value as Record<string, unknown>;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message, ...error.details }, { status: error.status });
  // Unexpected failures are logged by the host; the client gets no internals.
  console.error(error);
  return json({ error: 'Internal error' }, { status: 500 });
}

export const notFound = (what = 'Not found'): HttpError => new HttpError(404, what);
