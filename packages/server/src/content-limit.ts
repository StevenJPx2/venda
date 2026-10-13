import { ContentTooLarge, MAX_CONTENT_BYTES } from '@venda/contract';

const isContentWrite = (url: string) => {
  const path = new URL(url).pathname;

  return (
    path.startsWith('/api/admin/collections/') || path === '/api/admin/site'
  );
};

/** A body's bytes, or null once it passes `max`: streamed, so a lying length cannot get past. */
export async function boundedBody(
  body: ReadableStream<Uint8Array>,
  max: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader.read();

    if (chunk.done) break;

    size += chunk.value.byteLength;

    if (size > max) {
      await reader.cancel();

      return null;
    }

    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

/** Bound streams as well as declared lengths before the API decodes JSON. */
export async function limitContentRequest(
  request: Request
): Promise<Request | Response> {
  if (!request.body || !isContentWrite(request.url)) return request;

  const body = await boundedBody(request.body, MAX_CONTENT_BYTES);

  return body === null
    ? Response.json(new ContentTooLarge(), { status: 413 })
    : new Request(request, { method: request.method, body });
}
