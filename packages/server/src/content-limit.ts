import { ContentTooLarge, MAX_CONTENT_BYTES } from '@venda/contract';

/** Bound streams as well as declared lengths before the API decodes JSON. */
export async function limitContentRequest(
  request: Request
): Promise<Request | Response> {
  if (
    !request.body ||
    !new URL(request.url).pathname.startsWith('/api/admin/collections/')
  )
    return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader.read();

    if (chunk.done) break;

    size += chunk.value.byteLength;

    if (size > MAX_CONTENT_BYTES) {
      await reader.cancel();

      return Response.json(new ContentTooLarge(), { status: 413 });
    }

    chunks.push(chunk.value);
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request, { method: request.method, body });
}
