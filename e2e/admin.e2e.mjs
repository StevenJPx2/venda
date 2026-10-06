// The actual static admin, served with the API from the same Nitro host, on
// both presets. Browser contexts are separate people, not mocked credentials.
import { chromium } from 'playwright';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildNode, check, NODE, nodeDirectory, OWNER, startNode, startWorkers, stop, suite, WORKERS } from './support.mjs';

async function signIn(page, base) {
  await page.goto(`${base}/admin/content`);
  await page.getByRole('textbox', { name: /^Email/ }).fill(OWNER.email);
  await page.locator('input[name="password"]').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Content', exact: true }).waitFor();
}

async function contentChecks(page, label, base, screenshots) {
  await signIn(page, base);
  await page.getByRole('link').filter({ hasText: 'Field notes' }).click();
  await page.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(`${label}: content lists published and draft files`, await page.getByRole('link').filter({ hasText: 'Unfinished' }).count() === 1);
  const more = page.getByRole('button', { name: 'Load more', exact: true });

  if (await more.count()) {
    await more.click();
    await page.waitForFunction(() => document.querySelectorAll('a.content-row').length === 100);
    check(`${label}: a thousand-entry collection is loaded in pages`, await more.count() === 1);
  }

  // Typing alone searches; a quick correction must win over the query it replaced.
  const searchBox = page.getByRole('searchbox', { name: 'Search entries', exact: true });

  await searchBox.pressSequentially('Unfin');
  await searchBox.fill('First light');
  await page.getByRole('link').filter({ hasText: 'Unfinished' }).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.list-surface')?.getAttribute('aria-busy') === 'false');
  check(`${label}: typing searches, and the latest query wins`, await page.getByRole('link').filter({ hasText: 'First light' }).count() === 1 && await page.locator('a.content-row').count() === 1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('link').filter({ hasText: 'Unfinished' }).waitFor();
  check(`${label}: clearing the search brings every entry back`, await searchBox.inputValue() === '');
  await searchBox.fill('First light');
  await page.getByRole('link').filter({ hasText: 'Unfinished' }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(screenshots, `${label}-content.png`) });
  await page.getByRole('link').filter({ hasText: 'First light' }).click();
  await page.getByRole('heading', { name: 'First light', exact: true }).waitFor();
  check(`${label}: entry preview renders safe rich text`, await page.locator('.preview-prose strong').innerText() === '6:12');
  await page.getByRole('link', { name: 'Field notes', exact: true }).click();
  await page.getByRole('heading', { name: 'Field notes', exact: true }).waitFor();
  check(`${label}: the back link is named for, and returns to, the collection`, page.url().endsWith('/admin/content/field-notes'));
  await page.getByRole('link', { name: 'Content problems', exact: true }).click();
  await page.getByText('field-notes/no-title.md', { exact: true }).waitFor();
  check(`${label}: invalid file problems are visible`, (await page.locator('#main-content').innerText()).includes('title is required'));
  await page.reload();
  await page.getByRole('heading', { name: 'Content problems', exact: true }).waitFor();
  await page.getByText('field-notes/no-title.md', { exact: true }).waitFor();
  check(`${label}: a deep link reload keeps the session and shell`, await page.getByText('field-notes/no-title.md', { exact: true }).count() === 1);
}

async function inviteAndJoin(owner, ann, label, base) {
  await owner.getByRole('link', { name: 'Invitations', exact: true }).click();
  await owner.getByRole('button', { name: 'Invite someone', exact: true }).click();
  await owner.getByRole('dialog').getByRole('textbox', { name: /^Email/ }).fill(`ann-${label}@venda.test`);
  await owner.getByRole('button', { name: 'Create invitation', exact: true }).click();
  await owner.getByText('Invitation ready', { exact: true }).waitFor();

  const link = await owner.locator('code').innerText();

  await ann.goto(link);
  await ann.getByRole('textbox', { name: /^Your name/ }).fill('Ann');
  await ann.locator('input[name="password"]').fill('ann has a long password');
  await ann.getByRole('button', { name: 'Join the team', exact: true }).click();
  await ann.getByRole('link', { name: 'Open content', exact: true }).click();
  await ann.getByRole('heading', { name: 'Content', exact: true }).waitFor();
  check(`${label}: invitation joins a real person and signs them in`, await ann.getByRole('link', { name: 'Your account', exact: true }).count() === 1);
  check(`${label}: authors do not see administrator navigation`, await ann.getByRole('link', { name: 'People', exact: true }).count() === 0);
  await ann.getByRole('link').filter({ hasText: 'Field notes' }).click();
  await ann.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(`${label}: authors see published content, not file drafts`, await ann.getByRole('link').filter({ hasText: 'Unfinished' }).count() === 0);
  await ann.goto(`${base}/admin/settings/people`);
  await ann.getByRole('heading', { name: 'You do not have access to this page', exact: true }).waitFor();
}

async function tokenChecks(page, label, base) {
  await page.getByRole('link', { name: 'API tokens', exact: true }).click();
  await page.getByRole('button', { name: 'Create token', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Name/ }).fill('Browser test');
  await page.getByRole('dialog').getByRole('button', { name: 'Create token', exact: true }).click();
  await page.getByText('Save your token', { exact: true }).waitFor();

  const secret = await page.locator('code').innerText();
  const read = () => fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${secret}` } });

  check(`${label}: a UI-created token works over the API`, (await read()).ok);
  await page.getByRole('button', { name: 'Actions for Browser test', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Revoke token', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke token', exact: true }).click();
  await page.getByText('No API tokens', { exact: true }).waitFor();
  check(`${label}: confirmation revokes the token`, (await read()).status === 401);
}

async function peopleChecks(owner, ann, label) {
  await owner.getByRole('link', { name: 'People', exact: true }).click();
  await owner.getByRole('button', { name: `Actions for ann-${label.toLowerCase()}@venda.test`, exact: true }).click();
  await owner.getByRole('menuitem', { name: 'Edit person', exact: true }).click();
  await owner.getByRole('combobox', { name: 'Status', exact: true }).click();
  await owner.getByRole('option', { name: 'disabled', exact: true }).click();
  await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
  await owner.getByRole('dialog').waitFor({ state: 'hidden' });
  await ann.getByRole('link', { name: 'API tokens', exact: true }).click();
  await ann.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  check(`${label}: disabling someone returns their UI to sign-in`, await ann.getByRole('button', { name: 'Sign in', exact: true }).count() === 1);
}

async function mobileChecks(page, label, screenshots) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Content', exact: true }).click();
  await page.getByRole('heading', { name: 'Content', exact: true }).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(`${label}: mobile navigation closes after a page change`, !(await page.getByRole('dialog').isVisible()));
  check(`${label}: no horizontal overflow at 390px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('link').filter({ hasText: 'Field notes' }).click();
  await page.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(`${label}: entry rows fit on a narrow screen`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(screenshots, `${label}-mobile.png`) });
}

async function uiChecks(browser, label, base, screenshots) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
  const guest = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'dark' });
  const owner = await context.newPage();
  const ann = await guest.newPage();
  const errors = [];

  owner.on('pageerror', error => errors.push(error.message));
  ann.on('pageerror', error => errors.push(error.message));

  try {
    await contentChecks(owner, label, base, screenshots);
    await inviteAndJoin(owner, ann, label, base);
    await tokenChecks(owner, label, base);
    await peopleChecks(owner, ann, label);
    await owner.screenshot({ path: join(screenshots, `${label}-people.png`) });
    await mobileChecks(owner, label, screenshots);
    check(`${label}: no uncaught browser errors`, errors.length === 0, errors.join('\n'));
  } catch (error) {
    console.error(`${label} browser errors: ${errors.join('\n')}`);
    console.error(await owner.locator('body').innerText());
    await owner.screenshot({ path: join(screenshots, `${label}-failure.png`) });

    throw error;
  } finally {
    await context.close();
    await guest.close();
  }
}

await suite('admin', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const screenshots = await mkdtemp(join(tmpdir(), 'venda-admin-review-'));

  console.log(`Screenshots: ${screenshots}`);

  try {
    await startWorkers();
    await uiChecks(browser, 'Workers', WORKERS, screenshots);
    await buildNode();

    const dir = await nodeDirectory();

    // Real files exercise bounded sync, paging and long unbroken/non-Latin titles.
    for (let index = 0; index < 1001; index++) {
      const title = index === 0 ? '長い名前'.repeat(100) : `Stress entry ${index}`;

      await writeFile(join(dir, 'content/field-notes', `zz-stress-${String(index).padStart(4, '0')}.md`), `---\ntitle: ${title}\n---\n\nContent.\n`);
    }

    const node = await startNode(dir);

    await uiChecks(browser, 'Node', NODE, screenshots);
    await stop(node);
  } finally {
    await browser.close();
  }
});
