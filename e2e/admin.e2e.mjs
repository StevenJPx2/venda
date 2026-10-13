// The actual static admin, served with the API from the same Worker on local
// workerd, with the fixture content and a thousand extra entries imported.
// Browser contexts are separate people, not mocked credentials.
import { chromium } from 'playwright';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildWorkers,
  check,
  contentFiles,
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
  await fromSidebar(page, 'Settings');
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await page.getByRole('link', { name: new RegExp(`^${section}`) }).click();
}

/** A collection's link in the sidebar, under its group's heading. */
const sidebarLink = (page, name) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true });

const sidebarState = page =>
  page.locator('.floating-sidebar').getAttribute('data-state');

/** Opens a sidebar link, first bringing a hidden sidebar back from the edge. */
async function fromSidebar(page, name) {
  if ((await sidebarState(page)) === 'hidden') {
    await page.mouse.move(400, 300);
    await page.mouse.move(4, 300);
  }

  await sidebarLink(page, name).click();
}

// The toggle's box in the sidebar's head, then on the rail once it is hidden.
async function toggleBoxes(page) {
  const box = name =>
    page.getByRole('button', { name, exact: true }).boundingBox();

  await page.keyboard.press('ControlOrMeta+Backslash');
  const inside = await box('Hide sidebar');

  await page.keyboard.press('ControlOrMeta+Backslash');

  return { inside, rail: await box('Show sidebar') };
}

async function sidebarChecks(page, label) {
  const { inside, rail } = await toggleBoxes(page);

  check(
    `${label}: the sidebar's toggle is the same size and height inside it and on the rail`,
    inside.width === rail.width &&
      inside.height === rail.height &&
      inside.y === rail.y,
    JSON.stringify({ inside, rail })
  );

  await page.mouse.move(600, 300);
  await page.mouse.move(6, 500);
  await page
    .locator('.floating-sidebar[data-state="peek"]')
    .waitFor({ state: 'attached', timeout: 2000 });
  await page.mouse.move(120, 500);
  check(
    `${label}: the pointer near the left edge floats the sidebar out, and it stays while the pointer is on it`,
    (await sidebarState(page)) === 'peek'
  );
  await page.locator('.account-button').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).waitFor();
  await page.mouse.move(700, 500);
  await page.waitForTimeout(400);
  check(
    `${label}: a menu opened from the floating sidebar keeps it out while the menu is open`,
    (await sidebarState(page)) === 'peek' &&
      (await page.getByRole('menuitem', { name: 'Sign out' }).isVisible())
  );
  await page.keyboard.press('Escape');
  await page.mouse.move(710, 500);
  await page
    .locator('.floating-sidebar[data-state="hidden"]')
    .waitFor({ state: 'attached', timeout: 2000 });
  check(
    `${label}: moving well away from it hides it again`,
    (await sidebarState(page)) === 'hidden'
  );
}

async function contentChecks(page, label, base, screenshots) {
  await signIn(page, base, label);
  await sidebarLink(page, 'Field notes').click();
  await page.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(
    `${label}: collections are listed under Writing, Site and Data in the sidebar, marked when open`,
    (
      await page
        .getByRole('navigation', { name: 'Main navigation' })
        .locator('.nav-label')
        .allInnerTexts()
    ).join('|') === 'Writing|Site|Data' &&
      (await sidebarLink(page, 'Field notes').getAttribute('aria-current')) ===
        'page'
  );

  const header = await page.locator('.screen-heading').innerText();

  check(
    `${label}: a collection shows the description from its config.ts`,
    header.includes('Short dispatches from the hills, written on the day.') &&
      !header.includes('write path')
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
  await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
  check(
    `${label}: the writer opens the entry's title and body for editing`,
    (await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .inputValue()) === 'First light' &&
      (await page.locator('.ProseMirror strong').innerText()) === '6:12' &&
      (await page.locator('.ProseMirror').getAttribute('contenteditable')) ===
        'true'
  );
  check(
    `${label}: opening an entry hides the sidebar`,
    (await sidebarState(page)) === 'hidden'
  );
  await page.keyboard.press('ControlOrMeta+Backslash');
  check(
    `${label}: Cmd+\\ brings the sidebar back beside the entry`,
    (await sidebarState(page)) === 'shown'
  );
  await page.keyboard.press('ControlOrMeta+Backslash');
  check(
    `${label}: and hides it again`,
    (await sidebarState(page)) === 'hidden'
  );
  await sidebarChecks(page, label);
  check(
    `${label}: a block tag the editor has no node for is kept whole, not dropped`,
    (await page
      .locator('.venda-kept')
      .filter({ hasText: '<Callout>' })
      .count()) === 1 &&
      (await page.locator('.venda-kept-inline').innerText()) === '2'
  );

  const panel = await page
    .getByRole('complementary', { name: 'Entry details' })
    .innerText();

  check(
    `${label}: tags and the file live in the right-hand details panel`,
    panel.includes('dawn') &&
      panel.includes('content/field-notes/first-light') &&
      !(await page.locator('article').innerText()).includes('dawn')
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

// The status line beside the way back.
const entryStatus = page =>
  page.locator('.entry-actions .entry-state').innerText();

/** Waits for the status line to say `text`. */
const statusIs = (page, text) =>
  page.waitForFunction(
    expected =>
      document.querySelector('.entry-actions .entry-state')?.textContent ===
      expected,
    text,
    { timeout: 10_000 }
  );

// Editing saves itself; publishing writes the file; an outside edit is never overwritten.
async function editChecks(page, label, base, files) {
  const file = 'field-notes/first-light.md';
  const title = page.getByRole('textbox', { name: 'Title', exact: true });

  await page.goto(`${base}/admin/content/field-notes/first-light`);
  await title.waitFor();
  await title.fill('First light, edited');
  await statusIs(page, 'Saved · not published');
  await page.reload();
  await title.waitFor();
  check(
    `${label}: typing saves a working copy that survives a reload, leaving the file alone`,
    (await title.inputValue()) === 'First light, edited' &&
      !(await files.read(file)).includes('edited')
  );

  await page.getByRole('button', { name: 'Publish changes' }).click();
  await statusIs(page, 'Published');
  check(
    `${label}: Publish writes the file and the public API serves it`,
    (await files.read(file)).includes('title: First light, edited') &&
      (
        await (
          await fetch(`${base}/api/content/field-notes/first-light`)
        ).json()
      ).data.title === 'First light, edited'
  );

  await title.fill('Mine');
  await statusIs(page, 'Saved · not published');
  await files.write(
    file,
    (await files.read(file)).replace(
      'title: First light, edited',
      'title: Theirs'
    )
  );
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await page
    .getByText('The file changed outside Venda', { exact: true })
    .waitFor();
  check(
    `${label}: an outside edit stops Publish, keeps the copy, and leaves the file as they wrote it`,
    (await files.read(file)).includes('title: Theirs') &&
      (await title.inputValue()) === 'Mine'
  );
  await page.getByRole('button', { name: 'Keep editing mine' }).click();
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await statusIs(page, 'Published');
  check(
    `${label}: Keep editing mine then publishes over the outside edit, on purpose`,
    (await files.read(file)).includes('title: Mine')
  );

  // Later checks find the entry by its original title.
  await title.fill('First light');
  await statusIs(page, 'Saved · not published');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await statusIs(page, 'Published');

  // Enter at the end of the body starts a paragraph of its own, which stays.
  await page.locator('.ProseMirror').focus();
  await page.evaluate(() => {
    const last = [...document.querySelectorAll('.ProseMirror > p')].at(-1);
    const range = document.createRange();

    range.selectNodeContents(last);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('A paragraph of its own');
  await statusIs(page, 'Saved · not published');
  await page.reload();
  await page.locator('.ProseMirror').waitFor();
  check(
    `${label}: Enter in the body starts a new paragraph that is saved`,
    (await page
      .locator('.ProseMirror > p')
      .filter({ hasText: /^A paragraph of its own$/ })
      .count()) === 1
  );
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await statusIs(page, 'Published');
}

// A record and a single entry are created from the admin, then published.
async function createChecks(page, label, files) {
  const main = page.locator('#main-content');

  await fromSidebar(page, 'Authors');
  await main.getByRole('button', { name: 'New record' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Bo Chen');
  check(
    `${label}: a new entry suggests its slug from its title`,
    (await page.getByRole('textbox', { name: 'Slug' }).inputValue()) ===
      'bo-chen'
  );
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await main.getByRole('textbox', { name: 'Role' }).fill('Writer');
  await statusIs(page, 'Saved · not published');
  check(
    `${label}: a new record opens in its form as an unpublished copy`,
    (await entryStatus(page)) === 'Saved · not published' &&
      !(await files.exists('authors/bo-chen.md'))
  );
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await statusIs(page, 'Published');
  check(
    `${label}: publishing a new record writes its file`,
    (await files.read('authors/bo-chen.md')).includes('role: Writer')
  );
}

// Each kind of collection is shown by its own view and opened by its own editor.
async function kindChecks(page, label) {
  const main = page.locator('#main-content');

  await fromSidebar(page, 'Authors');
  await main.getByRole('link', { name: 'Ann Lee', exact: true }).waitFor();
  check(
    `${label}: records are a table with their fields as columns`,
    (await main.getByRole('columnheader').allInnerTexts()).join('|') ===
      'Name|Role|On staff' &&
      (await main.getByRole('cell').allInnerTexts()).join('|') === 'Editor|Yes'
  );
  await main.getByRole('link', { name: 'Ann Lee', exact: true }).click();
  await main.getByRole('textbox', { name: 'Role' }).waitFor();
  check(
    `${label}: a record opens as a form`,
    (await main.getByRole('textbox', { name: 'Role' }).inputValue()) ===
      'Editor' &&
      (await main.getByRole('switch', { name: 'On staff' }).isChecked())
  );

  await fromSidebar(page, 'Home');
  await main.getByRole('textbox', { name: 'Introduction' }).waitFor();
  check(
    `${label}: a single collection opens straight into its one entry`,
    (await main.getByRole('textbox', { name: 'Introduction' }).inputValue()) ===
      'Notes, maps and the people who make them.'
  );

  await fromSidebar(page, 'Changes');
  await main
    .getByRole('link')
    .filter({ hasText: 'The first change' })
    .waitFor();
  check(
    `${label}: a view the config names but nothing installs is reported, with the default in its place`,
    (await main.getByRole('status').innerText()).includes(
      '“acme.timeline”, which is not installed, so List shows it instead'
    )
  );
}

// content/site.ts names the site and words its screens; an empty string hides one.
async function siteChecks(page, label, base, files) {
  const heading = page.locator('.screen-heading');

  await page.goto(`${base}/admin/content`);
  await heading.getByText('Every note and map from the hills.').waitFor();
  check(
    `${label}: site.ts names the site in the sidebar and the window title`,
    (await page
      .getByRole('navigation', { name: 'Main navigation' })
      .locator('xpath=..')
      .getByRole('link', { name: 'Hill Notes', exact: true })
      .count()) === 1 && (await page.title()) === 'Content · Hill Notes'
  );

  await page.goto(`${base}/admin/account`);
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  check(
    `${label}: an empty description in site.ts hides the screen's own`,
    (await heading.locator('p').count()) === 0
  );

  await openSettings(page, 'General');
  await page.getByRole('heading', { name: 'General', exact: true }).waitFor();

  const siteName = page.getByRole('textbox', { name: 'Site name' });

  check(
    `${label}: General shows the site's settings and each screen's words`,
    (await siteName.inputValue()) === 'Hill Notes' &&
      (await page.locator('#main-content').innerText()).includes(
        'content.index'
      )
  );

  await siteName.fill('Hill Notes Weekly');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();

  const written = await files.read('site.ts');
  const named = await page
    .getByRole('navigation', { name: 'Main navigation' })
    .locator('xpath=..')
    .getByRole('link', { name: 'Hill Notes Weekly', exact: true })
    .count();

  check(
    `${label}: Save in General writes site.ts, and the sidebar takes the new name`,
    written.includes("name: 'Hill Notes Weekly'") && named > 0,
    `links named: ${named}\n${written}`
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
  await fromSidebar(ann, 'Field notes');
  await ann.getByRole('link').filter({ hasText: 'First light' }).waitFor();
  check(
    `${label}: authors see published content, not file drafts`,
    (await ann.getByRole('link').filter({ hasText: 'Unfinished' }).count()) ===
      0
  );

  // An entry nobody gave her: she reads it, but cannot change or publish it.
  await ann.getByRole('link').filter({ hasText: 'First light' }).click();
  await statusIs(ann, 'Published · read-only');
  check(
    `${label}: an author reads an entry she does not own, read-only and without Publish`,
    (await ann
      .getByRole('textbox', { name: 'Title', exact: true })
      .getAttribute('readonly')) !== null &&
      (await ann.getByRole('button', { name: /^Publish/ }).count()) === 0 &&
      (await ann.locator('.ProseMirror').getAttribute('contenteditable')) ===
        'false'
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
    sheet.includes('dawn') && sheet.includes('hills'),
    sheet
  );
  await page.screenshot({
    path: join(screenshots, `${label}-mobile-details.png`)
  });
}

async function uiChecks(browser, label, base, screenshots, files) {
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
    await editChecks(owner, label, base, files);
    await kindChecks(owner, label);
    await createChecks(owner, label, files);
    await siteChecks(owner, label, base, files);
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
    // A thousand more entries exercise batched imports, paging and long
    // unbroken, non-Latin titles.
    const extra = new Map();

    for (let index = 0; index < 1001; index++) {
      const title =
        index === 0 ? '長い名前'.repeat(100) : `Stress entry ${index}`;

      extra.set(
        `field-notes/zz-stress-${String(index).padStart(4, '0')}.md`,
        `---\ntitle: ${title}\n---\n\nContent.\n`
      );
    }

    await buildWorkers();

    const stopWorkers = await startWorkers(await workersState(), extra);

    await uiChecks(
      browser,
      'Workers',
      WORKERS,
      screenshots,
      await contentFiles()
    );
    await stopWorkers();
  } finally {
    await browser.close();
  }
});
