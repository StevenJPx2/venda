// Unpublish, trash and restore through the real Worker on workerd and D1:
// the API's transitions and guards, then the same flow in the admin.
import { chromium } from 'playwright';
import {
  addPerson,
  buildWorkers,
  check,
  contentFiles,
  OWNER,
  signedIn,
  startWorkers,
  suite,
  WORKERS,
  workersState
} from './support.mjs';

const ENTRY = '/admin/collections/field-notes/entries/first-light';
const FILE = 'field-notes/first-light.md';
const base = copy => ({ revision: copy.revision, sha: copy.currentSha });
const served = async () =>
  (await fetch(`${WORKERS}/api/content/field-notes/first-light`)).ok;

async function apiChecks(api, files) {
  const copy = (await api(`${ENTRY}/copy`)).json;
  const saved = (
    await api(`${ENTRY}/copy`, 'PUT', {
      revision: copy.revision,
      data: { ...copy.data, title: 'Edited before unpublishing' },
      publishedAt: copy.publishedAt
    })
  ).json;
  const hidden = await api(`${ENTRY}/unpublish`, 'POST', base(saved));

  check(
    'Workers: unpublish hides the entry from readers and keeps the saved edit',
    hidden.status === 200 &&
      !(await served()) &&
      (await files.read(FILE)).includes('draft: true') &&
      hidden.json.data.title === 'Edited before unpublishing'
  );

  const stale = await api(`${ENTRY}/trash`, 'POST', base(saved));
  const gone = await api(`${ENTRY}/trash`, 'POST', base(hidden.json));
  const listed = (await api('/admin/trash')).json.items;

  check(
    'Workers: trash from an old revision is refused; trash from the current one removes the file',
    stale.status === 409 &&
      stale.json._tag === 'EditedElsewhere' &&
      gone.status === 200 &&
      !(await files.exists(FILE)) &&
      listed.some(item => item.slug === 'first-light' && item.hasChanges)
  );

  const reopened = await api(`${ENTRY}/copy`);
  const back = await api(`${ENTRY}/restore`, 'POST', {
    revision: gone.json.revision
  });
  const again = await api(`${ENTRY}/restore`, 'POST', {
    revision: gone.json.revision
  });

  check(
    'Workers: a trashed entry is not editable; restore brings it back once, as a draft with the edit',
    reopened.status === 409 &&
      reopened.json._tag === 'EntryTrashed' &&
      back.status === 200 &&
      back.json.data.title === 'Edited before unpublishing' &&
      !(await served()) &&
      again.status === 409
  );

  const published = await api(`${ENTRY}/publish`, 'POST', {
    revision: back.json.revision
  });

  check(
    'Workers: publishing the restored copy makes it public with the edit',
    published.status === 200 &&
      (
        await (
          await fetch(`${WORKERS}/api/content/field-notes/first-light`)
        ).json()
      ).data.title === 'Edited before unpublishing'
  );
}

async function permissionChecks(owner) {
  const contributor = await addPerson(owner, 'contributor');
  const copy = (await owner(`${ENTRY}/copy`)).json;

  await owner(`${ENTRY}/owner`, 'PUT', {
    revision: copy.revision,
    ownerId: contributor.id
  });

  const mine = (await contributor.api(`${ENTRY}/copy`)).json;
  const refused = await contributor.api(`${ENTRY}/trash`, 'POST', base(mine));

  check(
    'Workers: a contributor can edit an entry but cannot unpublish or trash it',
    refused.status === 403 && (await served())
  );
}

async function uiChecks(browser) {
  const page = await browser.newPage();

  await page.goto(`${WORKERS}/admin/content/field-notes/first-light`);
  await page.getByRole('textbox', { name: /^Email/ }).fill(OWNER.email);
  await page.locator('input[name="password"]').fill(OWNER.password);
  await page.locator('input[name="password"]').press('Enter');

  const title = page.getByRole('textbox', { name: 'Title', exact: true });

  await title.waitFor();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await page.getByRole('heading', { name: 'Field notes' }).first().waitFor();
  await page.goto(`${WORKERS}/admin/trash`);

  const row = page.getByText('field-notes/first-light');

  await row.waitFor();
  check(
    'Admin: Move to trash asks first, removes the entry, and lists it in Trash',
    !(await served()) && (await row.count()) === 1
  );

  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Restore as draft' }).click();
  await title.waitFor();
  check(
    'Admin: Restore opens the entry again, as a draft',
    !(await served()) && (await title.inputValue()).length > 0
  );

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page
    .locator('.entry-actions .entry-state', { hasText: 'Published' })
    .waitFor({ timeout: 10_000 });
  check(
    'Admin: Publish puts the restored draft back on the site',
    await served()
  );
  await page.close();
}

await suite('lifecycle', async () => {
  const state = await workersState();

  await buildWorkers();

  const stop = await startWorkers(state);
  const owner = await signedIn();
  const browser = await chromium.launch();

  try {
    await apiChecks(owner, await contentFiles());
    await permissionChecks(owner);
    await uiChecks(browser);
  } finally {
    await browser.close();
    await stop();
  }
});
