// Content lifecycle: working copy vs live, preview on the site, history, trash, search, scheduled publishing.
import { chromium } from 'playwright';
import { ADMIN, API, LANDING, api, check, ownerCookie, signInAsOwner, startAdmin, startApi, startLanding, suite } from './support.mjs';

const landingText = async path => (await fetch(`${LANDING}${path}`)).text();

await suite('lifecycle', async () => {
  await startApi();
  const cookie = await ownerCookie();
  const schema = {
    titleField: 'title',
    previewUrl: `${LANDING}/blog/{slug}?preview={token}`,
    fields: [{ key: 'title', interface: 'input', required: true }, { key: 'excerpt', interface: 'textarea' }, { key: 'body', interface: 'wysiwyg' }]
  };
  const { body: blog } = await api('/collections', { method: 'POST', body: JSON.stringify({ name: 'Blog', slug: 'blog', schema }) }, cookie);
  const { body: post } = await api(`/collections/${blog.id}/entries`, { method: 'POST', body: JSON.stringify({ slug: 'launch', status: 'published', data: { title: 'Launch', body: '<p>Original text</p>' } }) }, cookie);
  await api(`/collections/${blog.id}/entries`, { method: 'POST', body: JSON.stringify({ slug: 'other', data: { title: 'Another story', body: '<p>Unrelated</p>' } }) }, cookie);

  await Promise.all([startAdmin(), startLanding()]);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await signInAsOwner(page);
  await page.goto(`${ADMIN}/editor/${blog.id}/${post.id}`, { waitUntil: 'networkidle' });
  const editor = page.locator('.ProseMirror');
  // The dev server compiles the editor route on first visit.
  await editor.waitFor({ timeout: 240000 });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' plus an unpublished edit');
  await page.getByText('Published · Unpublished changes · Saved').waitFor({ timeout: 30000 });
  check('edits to a published entry autosave as unpublished changes', true);
  check('the live page keeps the published text', (await landingText('/blog/launch')).includes('Original text') && !(await landingText('/blog/launch')).includes('unpublished edit'));

  const [previewTab] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Preview' }).click()]);
  await previewTab.waitForLoadState('networkidle');
  const previewBody = await previewTab.locator('body').innerText();
  check('Preview opens the site with the working copy', previewTab.url().startsWith(`${LANDING}/blog/launch?preview=`) && previewBody.includes('unpublished edit') && previewBody.includes('You are viewing unpublished changes'), previewTab.url());
  await previewTab.close();

  await page.getByRole('button', { name: 'Publish changes' }).click();
  await page.getByText('Published · Saved').waitFor({ timeout: 30000 });
  check('publishing makes the edit live', (await landingText('/blog/launch')).includes('unpublished edit'));

  await page.getByRole('button', { name: 'Revision history' }).click();
  await page.getByRole('dialog').getByText('Published').first().waitFor({ timeout: 15000 });
  check('history lists the publish revisions', (await page.getByRole('dialog').getByText('Published', { exact: true }).count()) >= 2);
  await page.keyboard.press('Escape');

  await page.goto(`${ADMIN}/?collection=${blog.id}`, { waitUntil: 'networkidle' });
  await page.getByLabel('Search entries').fill('another');
  await page.waitForFunction(() => !document.body.innerText.includes('Launch'), undefined, { timeout: 15000 });
  check('search narrows the entry list', (await page.locator('[data-slug]').count()) === 1 && (await page.locator('[data-slug="other"]').count()) === 1);
  await page.getByLabel('Search entries').fill('');

  await page.locator('[data-slug="other"]').getByRole('button', { name: 'Trash' }).click();
  await page.getByText('Moved to trash').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Trash', exact: true }).first().click();
  await page.locator('[data-slug="other"]').waitFor({ timeout: 15000 });
  await page.locator('[data-slug="other"]').getByRole('button', { name: 'Restore' }).click();
  await page.getByText('Entry restored as a draft').waitFor({ timeout: 15000 });
  check('trashed entries can be restored', true);
  await browser.close();

  // Scheduled publishing through the Worker's real Cron handler.
  const publishAt = new Date(Date.now() + 3000).toISOString();
  const { body: other } = await api(`/collections/${blog.id}/entries`, {}, cookie);
  const target = other.find(e => e.slug === 'other');
  const scheduled = await api(`/entries/${target.id}/schedule`, { method: 'PUT', body: JSON.stringify({ publishAt }) }, cookie);
  check('scheduling is accepted', scheduled.res.ok, JSON.stringify(scheduled.body));
  await new Promise(r => setTimeout(r, 4000));
  await fetch(`${API}/__scheduled?cron=*+*+*+*+*`);
  const live = await api('/content/blog/other');
  check('the Cron Trigger publishes due entries', live.res.ok && live.body?.data?.title === 'Another story', JSON.stringify(live.body));
});
