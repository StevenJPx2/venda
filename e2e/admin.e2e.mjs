// The actual static admin, served with the API from the same Worker on local
// workerd, over a live content folder with a thousand extra entries. Browser
// contexts are separate people, not mocked credentials.
import { chromium } from 'playwright';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildWorkers,
  check,
  liveContent,
  OWNER,
  startWorkers,
  suite,
  WORKERS,
  workersState
} from './support.mjs';

// Signs in with Enter, as people do: first with the password missing, which
// must ask for it, then with the password filled the way a password manager
// fills it (no input events) and Enter pressed in the password field.
async function signIn(page, base, label) {
  await page.goto(`${base}/admin/content`);

  const email = page.getByRole('textbox', { name: /^Email/ });
  const password = page.locator('input[name="password"]');

  await email.fill(OWNER.email);
  await email.press('Enter');
  await page.getByText('Enter your password.', { exact: true }).waitFor();
  check(
    `${label}: Enter with the password missing focuses it and asks for it`,
    await password.evaluate(input => input === document.activeElement)
  );
  await password.evaluate((input, value) => {
    input.value = value;
  }, OWNER.password);
  await password.press('Enter');

  const signedIn = await page
    .getByRole('heading', { name: 'Content', exact: true })
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false
    );

  check(
    `${label}: Enter in the password field signs in, even after autofill`,
    signedIn
  );
}

/** Icons on the page that draw nothing: no inline SVG and no image in their CSS. */
const blankIcons = page =>
  page.$$eval('.iconify', icons =>
    icons
      .filter(icon => {
        const style = getComputedStyle(icon);
        const drawn = [
          style.maskImage,
          style.webkitMaskImage,
          style.backgroundImage
        ].some(value => value?.includes('url('));

        return !drawn && !icon.querySelector('svg');
      })
      .map(icon => icon.className)
  );

// Settings live on their own page, reached from the foot of the navigation.
async function openSettings(page, section) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await page.getByRole('link', { name: new RegExp(`^${section}`) }).click();
}

/** A collection's link in the sidebar, under the Content heading. */
const sidebarLink = (page, name) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true });

async function contentChecks(page, label, base, screenshots) {
  await signIn(page, base, label);
  await sidebarLink(page, 'Field notes').click();
  await page.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(
    `${label}: each collection is listed under Content in the sidebar, marked when open`,
    (
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .innerText()
    ).includes('Content') &&
      (await sidebarLink(page, 'Field notes').getAttribute('aria-current')) ===
        'page'
  );
  check(
    `${label}: content lists published and draft files`,
    (await page.getByRole('link').filter({ hasText: 'Unfinished' }).count()) ===
      1
  );
  const more = page.getByRole('button', { name: 'Load more', exact: true });

  if (await more.count()) {
    await more.click();
    await page.waitForFunction(
      () => document.querySelectorAll('a.content-row').length === 100
    );
    check(
      `${label}: a thousand-entry collection is loaded in pages`,
      (await more.count()) === 1
    );
  }

  // Typing alone searches; a quick correction must win over the query it replaced.
  const searchBox = page.getByRole('searchbox', {
    name: 'Search entries',
    exact: true
  });

  await searchBox.pressSequentially('Unfin');
  await searchBox.fill('First light');
  await page
    .getByRole('link')
    .filter({ hasText: 'Unfinished' })
    .waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () =>
      document.querySelector('.list-surface')?.getAttribute('aria-busy') ===
      'false'
  );
  check(
    `${label}: typing searches, and the latest query wins`,
    (await page
      .getByRole('link')
      .filter({ hasText: 'First light' })
      .count()) === 1 && (await page.locator('a.content-row').count()) === 1
  );
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('link').filter({ hasText: 'Unfinished' }).waitFor();
  check(
    `${label}: clearing the search brings every entry back`,
    (await searchBox.inputValue()) === ''
  );
  await searchBox.fill('First light');
  await page
    .getByRole('link')
    .filter({ hasText: 'Unfinished' })
    .waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(screenshots, `${label}-content.png`) });
  await page.getByRole('link').filter({ hasText: 'First light' }).click();
  await page
    .getByRole('heading', { name: 'First light', exact: true })
    .waitFor();
  check(
    `${label}: entry preview renders safe rich text`,
    (await page.locator('.preview-prose strong').innerText()) === '6:12'
  );

  const panel = await page
    .getByRole('complementary', { name: 'Entry details' })
    .innerText();

  check(
    `${label}: tags and the file live in the right-hand details panel`,
    panel.includes('dawn, hills') &&
      panel.includes('content/field-notes/first-light') &&
      !(await page.locator('article').innerText()).includes('dawn, hills')
  );
  await page.screenshot({ path: join(screenshots, `${label}-entry.png`) });
  await page
    .locator('#main-content')
    .getByRole('link', { name: 'Field notes', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Field notes', exact: true })
    .waitFor();
  check(
    `${label}: the back link is named for, and returns to, the collection`,
    page.url().endsWith('/admin/content/field-notes')
  );
  await openSettings(page, 'Content problems');
  await page.getByText('field-notes/no-title.md', { exact: true }).waitFor();
  check(
    `${label}: invalid file problems are visible`,
    (await page.locator('#main-content').innerText()).includes(
      'title is required'
    )
  );
  await page
    .locator('#main-content')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  check(
    `${label}: a settings section leads back to Settings`,
    new URL(page.url()).pathname.replace(/\/$/, '') === '/admin/settings'
  );

  // The Settings page shows icons from the shell, the plugins and Nuxt UI.
  const blank = await blankIcons(page);

  check(
    `${label}: every icon on the page draws`,
    blank.length === 0,
    [...new Set(blank)].join(', ')
  );
  await page.goBack();
  await page
    .getByRole('heading', { name: 'Content problems', exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole('heading', { name: 'Content problems', exact: true })
    .waitFor();
  await page.getByText('field-notes/no-title.md', { exact: true }).waitFor();
  check(
    `${label}: a deep link reload keeps the session and shell`,
    (await page
      .getByText('field-notes/no-title.md', { exact: true })
      .count()) === 1
  );
}

async function inviteAndJoin(owner, ann, label, base) {
  await openSettings(owner, 'Invitations');
  await owner
    .getByRole('button', { name: 'Invite someone', exact: true })
    .click();
  await owner
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Email/ })
    .fill(`ann-${label}@venda.test`);
  await owner
    .getByRole('button', { name: 'Create invitation', exact: true })
    .click();
  await owner.getByText('Invitation ready', { exact: true }).waitFor();

  const link = await owner.locator('code').innerText();

  await ann.goto(link);
  await ann.getByRole('textbox', { name: /^Your name/ }).fill('Ann');
  await ann.locator('input[name="password"]').fill('ann has a long password');
  await ann.getByRole('button', { name: 'Join the team', exact: true }).click();
  await ann.getByRole('link', { name: 'Open content', exact: true }).click();
  await ann.getByRole('heading', { name: 'Content', exact: true }).waitFor();
  // Who you are is one collapsed button; your account opens from it.
  await ann.getByRole('button', { name: /^Ann/ }).click();
  check(
    `${label}: invitation joins a real person and signs them in`,
    (await ann
      .getByRole('menuitem', { name: 'Your account', exact: true })
      .count()) === 1
  );
  await ann.keyboard.press('Escape');
  await openSettings(ann, 'API tokens');
  await ann.getByRole('heading', { name: 'API tokens', exact: true }).waitFor();
  await ann
    .locator('#main-content')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await ann.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  check(
    `${label}: authors see only the settings they may use`,
    (await ann.getByRole('link', { name: /^People/ }).count()) === 0 &&
      (await ann.getByRole('link', { name: /^API tokens/ }).count()) === 1
  );
  await sidebarLink(ann, 'Field notes').click();
  await ann.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(
    `${label}: authors see published content, not file drafts`,
    (await ann.getByRole('link').filter({ hasText: 'Unfinished' }).count()) ===
      0
  );
  await ann.goto(`${base}/admin/settings/people`);
  await ann
    .getByRole('heading', {
      name: 'You do not have access to this page',
      exact: true
    })
    .waitFor();
}

async function tokenChecks(page, label, base) {
  await openSettings(page, 'API tokens');
  await page.getByRole('button', { name: 'Create token', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Name/ })
    .fill('Browser test');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create token', exact: true })
    .click();
  await page.getByText('Save your token', { exact: true }).waitFor();

  const secret = await page.locator('code').innerText();
  const read = () =>
    fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${secret}` }
    });

  check(`${label}: a UI-created token works over the API`, (await read()).ok);
  await page
    .getByRole('button', { name: 'Actions for Browser test', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Revoke token', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Revoke token', exact: true })
    .click();
  await page.getByText('No API tokens', { exact: true }).waitFor();
  check(
    `${label}: confirmation revokes the token`,
    (await read()).status === 401
  );
}

async function peopleChecks(owner, ann, label) {
  await openSettings(owner, 'People');
  await owner
    .getByRole('button', {
      name: `Actions for ann-${label.toLowerCase()}@venda.test`,
      exact: true
    })
    .click();
  await owner
    .getByRole('menuitem', { name: 'Edit person', exact: true })
    .click();
  await owner.getByRole('combobox', { name: 'Status', exact: true }).click();
  await owner.getByRole('option', { name: 'disabled', exact: true }).click();
  await owner
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await owner.getByRole('dialog').waitFor({ state: 'hidden' });
  // Her next navigation reloads the sidebar's collections; that request sends her back to sign-in.
  await ann
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await ann
    .getByRole('heading', { name: 'Welcome back', exact: true })
    .waitFor();
  check(
    `${label}: disabling someone returns their UI to sign-in`,
    (await ann
      .getByRole('button', { name: 'Sign in', exact: true })
      .count()) === 1
  );
}

async function mobileChecks(page, label, screenshots) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Field notes', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Field notes', exact: true })
    .waitFor();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(
    `${label}: mobile navigation closes after a page change`,
    !(await page.getByRole('dialog').isVisible())
  );
  check(
    `${label}: no horizontal overflow at 390px`,
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(
    `${label}: entry rows fit on a narrow screen`,
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.screenshot({ path: join(screenshots, `${label}-mobile.png`) });
  await page.getByRole('link').filter({ hasText: 'First light' }).click();
  await page
    .getByRole('button', { name: 'Entry details', exact: true })
    .click();

  const sheet = await page
    .getByRole('dialog', { name: 'Entry details' })
    .innerText();

  check(
    `${label}: on a phone the details panel opens as a sheet`,
    sheet.includes('dawn, hills')
  );
  await page.screenshot({
    path: join(screenshots, `${label}-mobile-details.png`)
  });
}

async function uiChecks(browser, label, base, screenshots) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'light'
  });
  const guest = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark'
  });
  const owner = await context.newPage();
  const ann = await guest.newPage();
  const errors = [];
  // Requests leaving the server's origin: icons, fonts or anything else fetched from a third party.
  const elsewhere = new Set();
  const watchRequests = request => {
    const url = request.url();

    if (!url.startsWith(base) && !/^(data|blob):/.test(url))
      elsewhere.add(new URL(url).origin);
  };

  owner.on('pageerror', error => errors.push(error.message));
  ann.on('pageerror', error => errors.push(error.message));
  context.on('request', watchRequests);
  guest.on('request', watchRequests);

  try {
    await contentChecks(owner, label, base, screenshots);
    await inviteAndJoin(owner, ann, label, base);
    await tokenChecks(owner, label, base);
    await peopleChecks(owner, ann, label);
    await owner.screenshot({ path: join(screenshots, `${label}-people.png`) });
    await mobileChecks(owner, label, screenshots);
    check(
      `${label}: no uncaught browser errors`,
      errors.length === 0,
      errors.join('\n')
    );
    check(
      `${label}: the admin requests nothing outside its own origin`,
      elsewhere.size === 0,
      [...elsewhere].join(', ')
    );
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
    const live = await liveContent();

    // Real files exercise bounded sync, paging and long unbroken/non-Latin titles.
    for (let index = 0; index < 1001; index++) {
      const title =
        index === 0 ? '長い名前'.repeat(100) : `Stress entry ${index}`;

      await writeFile(
        join(
          live,
          'field-notes',
          `zz-stress-${String(index).padStart(4, '0')}.md`
        ),
        `---\ntitle: ${title}\n---\n\nContent.\n`
      );
    }

    await buildWorkers();

    const stopWorkers = await startWorkers(await workersState(), live);

    await uiChecks(browser, 'Workers', WORKERS, screenshots);
    await stopWorkers();
  } finally {
    await browser.close();
  }
});
