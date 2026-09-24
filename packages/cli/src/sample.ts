// Starter content for a fresh install (Venda's "Welcome to Ghost"), created
// through the install's own API so it doubles as an end-to-end smoke test.

const POSTS_SCHEMA = {
  version: 1,
  titleField: 'title',
  fields: [
    { key: 'title', interface: 'input', required: true },
    { key: 'body', interface: 'wysiwyg', placeholder: 'Begin writing your post…', required: true },
    { key: 'excerpt', interface: 'textarea', note: 'A short summary for listings.' },
    { key: 'tags', interface: 'tags', width: 'half' },
    { key: 'featured', interface: 'toggle', width: 'half' },
    { key: 'featureImage', interface: 'image', label: 'Feature image' }
  ]
};

const WELCOME_BODY = [
  '<p>This is your own Venda, running entirely on your Cloudflare account: a Worker for the API and admin, D1 for content, R2 for media and KV for sessions.</p>',
  '<h2>Start writing</h2>',
  '<p>Open this post in the editor. Select text to format it, type <code>/</code> on an empty line to add a card, or use Markdown shortcuts like <code>## </code> for a heading.</p>',
  '<h2>Shape your content</h2>',
  '<p>Each collection has a <strong>data model</strong>. Add fields — rich text, images, dropdowns, dates — and every entry gets a matching form.</p>',
  '<h2>Deliver it anywhere</h2>',
  '<p>Published entries are served from <code>/api/content/posts</code>. In a Nuxt site, install <code>@venda/nuxt</code> and call <code>useVendaCollection(\'posts\')</code>.</p>'
].join('');

interface Session { cookie: string }

async function request(url: string, path: string, session: Session | null, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Cookie = session.cookie;
  return fetch(`${url}/api${path}`, { method: init.method ?? 'GET', headers, ...(init.body ? { body: JSON.stringify(init.body) } : {}) });
}

async function expectOk(response: Response, what: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response.json();
}

export async function login(url: string, email: string, password: string): Promise<Session> {
  const response = await request(url, '/auth/login', null, { method: 'POST', body: { email, password } });
  await expectOk(response, 'Signing in');
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('venda_session='));
  if (!cookie) throw new Error('Signing in did not return a session cookie.');
  return { cookie: cookie.split(';')[0]! };
}

/** Creates a "Posts" collection with a published welcome post. Skips if it exists. */
export async function createSampleContent(url: string, email: string, password: string): Promise<'created' | 'exists'> {
  const session = await login(url, email, password);

  const collections = await expectOk(await request(url, '/collections', session), 'Listing collections') as { slug: string }[];
  if (collections.some(c => c.slug === 'posts')) return 'exists';

  const posts = await expectOk(await request(url, '/collections', session, { method: 'POST', body: { name: 'Posts', slug: 'posts', schema: POSTS_SCHEMA } }), 'Creating the Posts collection') as { id: string };
  await expectOk(await request(url, `/collections/${posts.id}/entries`, session, {
    method: 'POST',
    body: { slug: 'welcome-to-venda', status: 'published', data: { title: 'Welcome to Venda', excerpt: 'Your self-hosted CMS is ready.', tags: ['getting-started'], body: WELCOME_BODY } }
  }), 'Creating the welcome post');

  return 'created';
}
