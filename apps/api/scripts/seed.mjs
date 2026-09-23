// Seeds the Venda CMS with sample collections and entries through the API.
// Usage: VENDA_ADMIN_PASSWORD=... node apps/api/scripts/seed.mjs
//   VENDA_API_BASE       (default http://localhost:8787/api)
//   VENDA_ADMIN_EMAIL    (default admin@example.com)
//   VENDA_ADMIN_PASSWORD (required — never hardcode credentials)

const API = process.env.VENDA_API_BASE ?? 'http://localhost:8787/api';
const EMAIL = process.env.VENDA_ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.VENDA_ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error('Set VENDA_ADMIN_PASSWORD before running the seed script.');
  process.exit(1);
}

let cookie = '';

async function call(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

async function login() {
  const { status } = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (status !== 200) throw new Error(`Login failed (${status}). Check VENDA_ADMIN_EMAIL / VENDA_ADMIN_PASSWORD.`);
  console.log(`Signed in as ${EMAIL}`);
}

async function ensureCollection(collection) {
  const list = await call('/collections');
  const existing = list.data.find((item) => item.slug === collection.slug);
  if (existing) {
    console.log(`• collection "${collection.slug}" already exists`);
    return existing.id;
  }
  const created = await call('/collections', { method: 'POST', body: collection });
  const id = (await call('/collections')).data.find((item) => item.slug === collection.slug)?.id;
  console.log(`+ created collection "${collection.slug}" (${created.status})`);
  return id;
}

async function ensureEntry(collectionId, entry) {
  const existing = (await call(`/collections/${collectionId}/entries`)).data.find((item) => item.slug === entry.slug);
  if (existing) {
    console.log(`  • entry "${entry.slug}" already exists`);
    return;
  }
  const created = await call(`/collections/${collectionId}/entries`, { method: 'POST', body: entry });
  console.log(`  + entry "${entry.slug}" (${created.status})`);
}

const collections = [
  {
    definition: { name: 'Blog Posts', slug: 'blog', schema: { title: 'string', excerpt: 'string', body: 'markdown', tags: 'string[]', hero: 'string' } },
    entries: [
      { slug: 'hello-venda', status: 'published', data: { title: 'Hello, Venda', excerpt: 'Why we built a CMS entirely on Cloudflare.', body: '# Hello, Venda\n\nVenda runs on Workers, D1, R2 and KV. Nothing to provision, scales to zero.', tags: ['announcement', 'edge'], hero: '' } },
      { slug: 'edge-first-content', status: 'published', data: { title: 'Edge-first content delivery', excerpt: 'Serving published content from KV-backed cache.', body: '## Fast by default\n\nPublished entries are cached close to every reader.', tags: ['performance', 'kv'], hero: '' } },
      { slug: 'modeling-with-json', status: 'published', data: { title: 'Modeling content with JSON', excerpt: 'Evolve your schema without a migration every time.', body: 'Entries store JSON, so collections can grow organically.', tags: ['modeling'], hero: '' } },
      { slug: 'roadmap-2026', status: 'draft', data: { title: 'Roadmap 2026 (draft)', excerpt: 'What is coming next — not published yet.', body: 'Workers AI summaries, scheduled publishing, and webhooks.', tags: ['roadmap'], hero: '' } },
    ],
  },
  {
    definition: { name: 'Authors', slug: 'authors', schema: { name: 'string', role: 'string', bio: 'string', avatar: 'string' } },
    entries: [
      { slug: 'ada-lovelace', status: 'published', data: { name: 'Ada Lovelace', role: 'Founding Editor', bio: 'Writes about computation at the edge.', avatar: '' } },
      { slug: 'grace-hopper', status: 'published', data: { name: 'Grace Hopper', role: 'Staff Writer', bio: 'Compiles thoughts on developer tooling.', avatar: '' } },
    ],
  },
  {
    definition: { name: 'Products', slug: 'products', schema: { name: 'string', price: 'number', currency: 'string', inStock: 'boolean', description: 'string' } },
    entries: [
      { slug: 'edge-mug', status: 'published', data: { name: 'Edge Mug', price: 18, currency: 'USD', inStock: true, description: 'Keeps coffee warm at 300 locations worldwide.' } },
      { slug: 'worker-tee', status: 'published', data: { name: 'Worker Tee', price: 29, currency: 'USD', inStock: true, description: 'A soft tee for people who deploy on Fridays.' } },
      { slug: 'kv-sticker-pack', status: 'published', data: { name: 'KV Sticker Pack', price: 6, currency: 'USD', inStock: false, description: 'Cache these on your laptop.' } },
    ],
  },
  {
    definition: { name: 'Pages', slug: 'pages', schema: { title: 'string', body: 'markdown' } },
    entries: [
      { slug: 'about', status: 'published', data: { title: 'About Venda', body: 'Venda is a small headless CMS built entirely on the Cloudflare stack.' } },
      { slug: 'contact', status: 'published', data: { title: 'Contact', body: 'Reach us at hello@venda.example.' } },
    ],
  },
];

async function main() {
  await login();
  for (const group of collections) {
    const id = await ensureCollection(group.definition);
    for (const entry of group.entries) await ensureEntry(id, entry);
  }
  console.log('\nDone. Open the admin at https://app.venda.stevenjohn.co');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
