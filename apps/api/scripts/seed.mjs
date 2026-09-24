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

// With --update, existing collections get the seed data model and existing
// entries the seed content; otherwise both are left alone so edits survive.
const UPDATE = process.argv.includes('--update');

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
  if (existing && UPDATE) {
    const updated = await call(`/collections/${existing.id}`, { method: 'PATCH', body: { name: collection.name, schema: collection.schema } });
    console.log(`~ collection "${collection.slug}" data model updated (${updated.status})${updated.status >= 400 ? ` — ${JSON.stringify(updated.data)}` : ''}`);
    return existing.id;
  }
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
  if (existing && UPDATE) {
    const updated = await call(`/entries/${existing.id}`, { method: 'PATCH', body: { data: entry.data, status: entry.status } });
    console.log(`  ~ entry "${entry.slug}" updated (${updated.status})`);
    return;
  }
  if (existing) {
    console.log(`  • entry "${entry.slug}" already exists`);
    return;
  }
  const created = await call(`/collections/${collectionId}/entries`, { method: 'POST', body: entry });
  console.log(`  + entry "${entry.slug}" (${created.status})`);
}

const collections = [
  {
    definition: {
      name: 'Blog Posts',
      slug: 'blog',
      schema: {
        version: 1,
        titleField: 'title',
        fields: [
          { key: 'title', interface: 'input', label: 'Title', required: true },
          { key: 'body', interface: 'wysiwyg', label: 'Body', placeholder: 'Begin writing your post…', required: true },
          { key: 'excerpt', interface: 'textarea', label: 'Excerpt', note: 'A short summary shown on the blog index.' },
          { key: 'tags', interface: 'tags', label: 'Tags', width: 'half' },
          { key: 'featured', interface: 'toggle', label: 'Featured', width: 'half' },
          { key: 'featureImage', interface: 'image', label: 'Feature image' }
        ]
      }
    },
    entries: [
      { slug: 'hello-venda', status: 'published', data: { title: 'Hello, Venda', excerpt: 'Why we built a CMS entirely on Cloudflare.', tags: ['announcement', 'edge'], body: '<p>Venda is a small headless CMS that runs entirely on Cloudflare: <strong>Workers</strong> for the API, <strong>D1</strong> for content, <strong>R2</strong> for media and <strong>KV</strong> for cache.</p><h2>Why the edge?</h2><p>There is nothing to provision and nothing idling. When nobody is reading, it costs close to nothing; when everyone is, it is already close to them.</p><ul><li>No servers or containers to patch</li><li>Content stored in SQLite on D1</li><li>Media served from R2 with zero egress fees</li></ul><blockquote><p>This page is itself a Venda entry, rendered from the public content API.</p></blockquote>' } },
      { slug: 'edge-first-content', status: 'published', data: { title: 'Edge-first content delivery', excerpt: 'Serving published content from the public API, close to every reader.', tags: ['performance', 'kv'], body: '<p>Published entries are exposed through a tiny public API:</p><pre><code>GET /api/content/:collection\nGET /api/content/:collection/:slug</code></pre><p>Responses carry <code>Cache-Control: public, max-age=60</code>, and every write invalidates the collection\'s cache key in KV.</p><h2>Drafts stay private</h2><p>Only entries with status <em>published</em> are returned. Drafts are visible in the admin and nowhere else.</p>' } },
      { slug: 'modeling-with-json', status: 'published', data: { title: 'Modeling content with JSON', excerpt: 'Evolve your schema without a migration every time.', tags: ['modeling'], body: '<p>Every entry stores its fields as a JSON object, so a collection can grow new fields without a database migration.</p><h2>A convention, not a cage</h2><p>The editor treats <code>title</code> and <code>body</code> specially: title is a plain field and body is rich text saved as HTML. Everything else lives alongside them as ordinary JSON.</p><ol><li>Create a collection</li><li>Write entries with the rich-text editor</li><li>Add extra fields whenever you need them</li></ol>' } },
      { slug: 'roadmap-2026', status: 'draft', data: { title: 'Roadmap 2026', excerpt: 'What is coming next. Not published yet.', tags: ['roadmap'], body: '<p>Workers AI summaries, scheduled publishing and webhooks.</p>' } },
    ],
  },
  {
    definition: { name: 'Features', slug: 'features', schema: { version: 1, titleField: 'title', fields: [
      { key: 'title', interface: 'input', required: true },
      { key: 'description', interface: 'textarea', required: true },
      { key: 'icon', interface: 'input', width: 'half', placeholder: 'i-lucide-zap', note: 'Any Lucide icon name, e.g. i-lucide-zap.' },
      { key: 'order', interface: 'number', width: 'half', note: 'Lower numbers appear first.' }
    ] } },
    entries: [
      { slug: 'flexible-collections', status: 'published', data: { order: 1, icon: 'i-lucide-panels-top-left', title: 'Flexible collections', description: 'Define collections and store JSON entries, so your content model can evolve without a migration every time.' } },
      { slug: 'rich-text-editor', status: 'published', data: { order: 2, icon: 'i-lucide-pen-line', title: 'Rich-text editing', description: 'Write in a WYSIWYG editor with headings, lists, links and code blocks. Bodies are saved as clean HTML.' } },
      { slug: 'edge-delivery', status: 'published', data: { order: 3, icon: 'i-lucide-zap', title: 'Edge-fast delivery', description: 'Published content is served from public API routes, cached close to every reader on Cloudflare’s network.' } },
      { slug: 'media-on-r2', status: 'published', data: { order: 4, icon: 'i-lucide-image', title: 'Media on R2', description: 'Upload images and files to R2 with no egress fees, then serve them back through the API.' } },
      { slug: 'signed-sessions', status: 'published', data: { order: 5, icon: 'i-lucide-shield-check', title: 'Signed sessions', description: 'Admin access uses HMAC-signed, KV-backed cookie sessions and can sit behind Cloudflare Access.' } },
      { slug: 'workers-ai-ready', status: 'published', data: { order: 6, icon: 'i-lucide-sparkles', title: 'Workers AI ready', description: 'Add summaries, tags or alt text later with an optional Workers AI binding and no content model rewrite.' } },
    ],
  },
  {
    definition: { name: 'Steps', slug: 'steps', schema: { version: 1, titleField: 'title', fields: [
      { key: 'title', interface: 'input', required: true },
      { key: 'description', interface: 'textarea', required: true },
      { key: 'order', interface: 'number', width: 'half', note: 'Lower numbers appear first.' }
    ] } },
    entries: [
      { slug: 'sign-in', status: 'published', data: { order: 1, title: 'Sign in', description: 'Log in to the admin with a signed session cookie.' } },
      { slug: 'create-a-collection', status: 'published', data: { order: 2, title: 'Create a collection', description: 'Name it, give it a slug, and describe its shape.' } },
      { slug: 'write-entries', status: 'published', data: { order: 3, title: 'Write entries', description: 'Author and publish entries in the rich-text editor.' } },
      { slug: 'deliver', status: 'published', data: { order: 4, title: 'Deliver', description: 'Read published content from the public API — like this page does.' } },
    ],
  },
  {
    definition: { name: 'Authors', slug: 'authors', schema: { version: 1, titleField: 'name', fields: [
      { key: 'name', interface: 'input', required: true, width: 'half' },
      { key: 'role', interface: 'input', width: 'half' },
      { key: 'bio', interface: 'wysiwyg', label: 'Bio', placeholder: 'A few words about this author…' },
      { key: 'avatar', interface: 'image' }
    ] } },
    entries: [
      { slug: 'ada-lovelace', status: 'published', data: { name: 'Ada Lovelace', role: 'Founding Editor', bio: '<p>Writes about computation at the edge.</p>' } },
      { slug: 'grace-hopper', status: 'published', data: { name: 'Grace Hopper', role: 'Staff Writer', bio: '<p>Compiles thoughts on developer tooling.</p>' } },
    ],
  },
  {
    definition: { name: 'Products', slug: 'products', schema: { version: 1, titleField: 'name', fields: [
      { key: 'name', interface: 'input', required: true },
      { key: 'price', interface: 'number', required: true, width: 'half' },
      { key: 'currency', interface: 'dropdown', width: 'half', choices: [{ value: 'USD', label: 'US dollar' }, { value: 'EUR', label: 'Euro' }, { value: 'GBP', label: 'Pound sterling' }] },
      { key: 'inStock', interface: 'toggle', label: 'In stock', width: 'half' },
      { key: 'launchedAt', interface: 'datetime', label: 'Launched', width: 'half' },
      { key: 'description', interface: 'textarea' },
      { key: 'photo', interface: 'image' }
    ] } },
    entries: [
      { slug: 'edge-mug', status: 'published', data: { name: 'Edge Mug', price: 18, currency: 'USD', inStock: true, description: 'Keeps coffee warm at 300 locations worldwide.' } },
      { slug: 'worker-tee', status: 'published', data: { name: 'Worker Tee', price: 29, currency: 'USD', inStock: true, description: 'A soft tee for people who deploy on Fridays.' } },
      { slug: 'kv-sticker-pack', status: 'published', data: { name: 'KV Sticker Pack', price: 6, currency: 'USD', inStock: false, description: 'Cache these on your laptop.' } },
    ],
  },
  {
    definition: { name: 'Pages', slug: 'pages', schema: { version: 1, titleField: 'title', fields: [
      { key: 'title', interface: 'input', required: true },
      { key: 'body', interface: 'wysiwyg', placeholder: 'Write the page…' },
      { key: 'headline', interface: 'input', note: 'Small label above the title (home page).' },
      { key: 'description', interface: 'textarea', note: 'Lead paragraph (home page).' }
    ] } },
    entries: [
      { slug: 'home', status: 'published', data: { headline: 'Built entirely on Cloudflare', title: 'The headless CMS that lives on the edge', description: 'Venda pairs a Nuxt UI admin with a Workers API, D1 for content, R2 for media, and KV for cache. This page is rendered from Venda’s own content API.' } },
      { slug: 'about', status: 'published', data: { title: 'About Venda', body: '<p>Venda is a small headless CMS built entirely on the Cloudflare stack.</p>' } },
      { slug: 'contact', status: 'published', data: { title: 'Contact', body: '<p>Reach us at <a href="mailto:hello@venda.example">hello@venda.example</a>.</p>' } },
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
