// Nitro serves assets first. Unmatched HTML deep links open the Nuxt shell;
// missing scripts and non-GET requests must not become HTML successes.
export function respondToAdminPath(
  request: Request,
  shell: string
): Response | undefined {
  const path = new URL(request.url).pathname;

  if (path === '/admin')
    return Response.redirect(new URL('/admin/', request.url), 302);
  if (!path.startsWith('/admin/') || !['GET', 'HEAD'].includes(request.method))
    return;
  if (path.startsWith('/admin/_nuxt/') || /\.[a-z0-9]+$/i.test(path))
    return new Response('Not found', { status: 404 });

  return new Response(request.method === 'HEAD' ? null : shell, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
