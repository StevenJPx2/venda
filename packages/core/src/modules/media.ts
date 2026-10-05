import type { RequestContext } from '../context';
import { HttpError, json, notFound } from '../http';
import { route } from '../router';
import { slugify } from '../validation';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function uploadMedia(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require('media:upload');
  let form: FormData;

  try {
    form = await ctx.request.formData();
  } catch {
    throw new HttpError(400, 'Expected a multipart form upload');
  }

  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'A file field is required');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Maximum file size is 10MB');
  const key = `${crypto.randomUUID()}-${slugify(file.name) || 'upload'}`;
  const contentType = file.type || 'application/octet-stream';
  const { db, storage } = ctx.services.config;
  await storage.put(key, file, { contentType });
  const createdAt = new Date().toISOString();
  await db.run('INSERT INTO media (id, object_key, filename, content_type, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), key, file.name, contentType, file.size, actor.user.id, createdAt);
  return json({ key, filename: file.name, contentType, size: file.size, createdAt }, { status: 201 });
}

async function serveMedia(ctx: RequestContext): Promise<Response> {
  const object = await ctx.services.config.storage.get(ctx.params.key ?? '');
  if (!object) throw notFound('Media not found');
  // Keys embed a random id, so a URL always refers to the same bytes.
  const headers = new Headers({ 'Cache-Control': 'public, max-age=31536000, immutable' });
  if (object.contentType) headers.set('Content-Type', object.contentType);
  if (object.size !== undefined) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}

export const mediaRoutes = [
  route('POST', '/api/media', uploadMedia),
  route('GET', '/api/media/*key', serveMedia)
];
