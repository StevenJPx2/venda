// Structured rich text: admin editor → API document → landing server-side rendering.
import { chromium } from 'playwright';
import { ADMIN, LANDING, api, check, ownerCookie, signInAsOwner, startAdmin, startApi, startLanding, suite } from './support.mjs';

await suite('rich text', async () => {
  await startApi();
  const cookie = await ownerCookie();
  const schema = { titleField: 'title', fields: [{ key: 'title', interface: 'input', required: true }, { key: 'excerpt', interface: 'textarea' }, { key: 'body', interface: 'wysiwyg' }] };
  const { body: blog } = await api('/collections', { method: 'POST', body: JSON.stringify({ name: 'Blog', slug: 'blog', schema }) }, cookie);
  // HTML as written by older clients, including markup the renderer must neutralise.
  await api(`/collections/${blog.id}/entries`, { method: 'POST', body: JSON.stringify({ slug: 'legacy', status: 'published', data: { title: 'Legacy', body: '<p>Old <sup>1</sup> <a href="javascript:alert(1)">bad</a><script>alert(2)</script></p>' } }) }, cookie);

  await startAdmin();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'New entry' }).click();
  const title = page.getByRole('textbox', { name: 'Title' });
  // The dev server compiles the editor route on first visit, which can take minutes on a cold cache.
  await title.waitFor({ timeout: 240000 });
  await title.fill('Structured post');
  await title.press('Enter');
  await page.keyboard.type('Hello ');
  await page.keyboard.press('Meta+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('Meta+b');
  await page.keyboard.type(' world');
  await page.getByText('Draft · Saved').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/Published · Saved/).waitFor({ timeout: 30000 });

  const { body: posts } = await api('/content/blog');
  const post = posts.find(p => p.slug === 'structured-post');
  check('editor saves rich text as a document', post?.data.body?.type === 'doc', JSON.stringify(post?.data.body));
  check('bold survives as a mark', JSON.stringify(post?.data.body?.content?.[0]).includes('"marks":[{"type":"bold"}]'), JSON.stringify(post?.data.body));
  check('legacy HTML is served as a document', posts.find(p => p.slug === 'legacy')?.data.body?.type === 'doc');

  const { body: entries } = await api(`/collections/${blog.id}/entries`, {}, cookie);
  await page.goto(`${ADMIN}/editor/${blog.id}/${entries.find(e => e.slug === 'legacy').id}`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Title' }).waitFor({ timeout: 30000 });
  check('editor keeps superscripts from imported content', (await page.locator('.ProseMirror sup').count()) === 1);
  await browser.close();

  await startLanding();
  const html = await (await fetch(`${LANDING}/blog/structured-post`)).text();
  check('landing server-renders the document', html.includes('Hello <strong>bold</strong> world'));
  const article = (await (await fetch(`${LANDING}/blog/legacy`)).text()).match(/<article class="venda-content[^]*?<\/article>/)?.[0] ?? '';
  check('landing renders legacy HTML safely', article.includes('<sup>1</sup>') && !article.includes('javascript:') && !article.includes('<script'), article.slice(0, 300));
});
