import { expect, it } from 'vitest';
import { respondToAdminPath as adminResponse } from '../src/admin';

it('serves the shell for deep links, not missing assets, other paths or writes', async () => {
  const request = (path: string, method = 'GET') => new Request(`https://site.test${path}`, { method });
  const shell = '<main>admin</main>';
  const response = adminResponse(request('/admin/content/blog'), shell);

  expect(await response?.text()).toBe(shell);
  expect(response?.headers.get('cache-control')).toBe('no-store');
  expect(adminResponse(request('/admin'), shell)?.headers.get('location')).toBe('https://site.test/admin/');
  expect(adminResponse(request('/admin/_nuxt/no.js'), shell)?.status).toBe(404);
  expect(adminResponse(request('/admin/file.css'), shell)?.status).toBe(404);
  expect(adminResponse(request('/admin/content', 'POST'), shell)).toBeUndefined();
  expect(adminResponse(request('/api/health'), shell)).toBeUndefined();
  expect(await adminResponse(request('/admin/content', 'HEAD'), shell)?.text()).toBe('');
});
