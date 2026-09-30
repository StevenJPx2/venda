// Users: invitations, roles and role-aware admin UI.
import { chromium } from 'playwright';
import { ADMIN, check, signInAsOwner, startAdmin, startApi, suite } from './support.mjs';

await suite('users', async () => {
  await startApi();
  await startAdmin();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const owner = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await signInAsOwner(owner);
  await owner.getByRole('button', { name: 'New collection' }).waitFor({ timeout: 60000 });
  check('recovery admin signs in and can create collections', true);

  await owner.getByRole('button', { name: 'New collection' }).click();
  await owner.getByRole('dialog').getByLabel('Name').fill('Articles');
  await owner.getByRole('button', { name: 'Create collection' }).click();
  await owner.getByText('/articles').first().waitFor({ timeout: 15000 });

  await owner.getByRole('button', { name: /owner@example\.com/ }).click();
  await owner.getByRole('menuitem', { name: 'Users' }).click();
  await owner.getByRole('heading', { name: 'Users' }).waitFor();
  await owner.getByPlaceholder('teammate@example.com…').fill('cat@example.com');
  await owner.getByRole('combobox').first().click();
  await owner.getByRole('option', { name: /Contributor/ }).click();
  await owner.getByRole('button', { name: 'Create invite' }).click();
  const link = (await owner.locator('code').first().textContent())?.trim() ?? '';
  check('admin creates an invitation link', link.startsWith(`${ADMIN}/invite/`), link);

  const cat = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await cat.goto(link, { waitUntil: 'networkidle' });
  await cat.getByText('invited as contributor').waitFor({ timeout: 30000 });
  await cat.locator('input[autocomplete="name"]').fill('Cat');
  await cat.locator('input[type="password"]').nth(0).fill('a-strong-password');
  await cat.locator('input[type="password"]').nth(1).fill('a-strong-password');
  await cat.getByRole('button', { name: 'Create account' }).click();
  await cat.getByRole('button', { name: /Cat/ }).waitFor({ timeout: 30000 });
  check('invitee creates an account and lands in the dashboard', true);

  await cat.getByRole('button', { name: /Articles/ }).first().click();
  await cat.getByRole('link', { name: 'New entry' }).waitFor();
  check('contributor cannot create collections', (await cat.getByRole('button', { name: 'New collection' }).count()) === 0);
  check('contributor cannot edit data models', (await cat.getByRole('link', { name: 'Data model' }).count()) === 0);
  check('contributor cannot upload media', (await cat.getByText('Media library').count()) === 0);
  await cat.getByRole('link', { name: 'New entry' }).click();
  await cat.getByText('An editor will publish this').waitFor({ timeout: 30000 });
  check('contributor editor hides Publish', (await cat.getByRole('button', { name: 'Publish' }).count()) === 0);

  await owner.reload({ waitUntil: 'networkidle' });
  check('admin sees the new contributor in the team', (await owner.locator('ul li').allTextContents()).some(row => row.includes('cat@example.com')));
  await browser.close();
});
