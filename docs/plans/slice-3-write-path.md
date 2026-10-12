# Slice 3: the write path

Status: **proposed**. Builds on [architecture.md](../architecture.md), flows
1 and 2 (Save, Publish) and the slice list under Delivery.

People edit content in the admin. Every change autosaves to a working copy in
the database; publishing writes the entry's file through the content store,
refusing to overwrite a file that changed since the copy was taken. Records,
single collections and `site.ts` are edited in forms, and posts and pages in
the writer, which is the Focus prototype rebuilt as a plugin.

## Scope

In:

- Working copies: autosave, discard, and an edited-elsewhere guard.
- Publishing an edited entry or a new one to its file, with conflicts.
- Writing to the local content folder. A deployed server keeps reading its
  bundled content and says that publishing needs GitHub.
- Content capabilities per role, with entry ownership.
- The `field` slot, `@venda/fields-core`, and the form editor made editable.
- `@venda/editor-writer`: the writer as a plugin, replacing `venda.writer`.
- Settings → General edits `site.ts`.

Out, in later slices:

- The GitHub store and webhook sync: slice 4.
- Scheduling, unpublish, trash, revisions and preview: slice 5.
- The `block` slot (callout, embeds as plugins) and the model editor that
  writes `config.ts`: slice 6.

## Working copies

A working copy is one row per entry, shared by everyone who may edit it:

| Column | Holds |
| --- | --- |
| `collection`, `slug` | the entry it belongs to |
| `base_sha` | the file's SHA when the copy was taken; null for a new entry |
| `data_json`, `published_at` | the edited fields and date |
| `revision` | raises by one on every save |
| `updated_by`, `updated_at` | who saved it last, and when |

- The editor saves 800 ms after typing stops, and on leaving the page. Each
  save sends the revision it started from. A stale revision answers
  `EditedElsewhere`, and the editor offers to load the newer copy.
- A save checks field types only, so a half-written entry always saves.
  Publishing applies the model's full rules.
- Discarding deletes the copy; the file is untouched.
- The admin's lists show an entry with a copy as "Changes not published", and
  a new entry that has no file yet as "New".

```bash
curl -X PUT $API/admin/collections/journal/entries/first-light/copy \
  -d '{"revision":3,"data":{"title":"First light"},"publishedAt":null}'
# → { "revision": 4, "baseSha": "9f2c…", "updatedBy": "Ann Lee", … }
```

## Publishing

1. The core turns the copy into a file with `writeEntry`, then reads that file
   back with `readEntry`. If the read fails (a required field is empty, a
   value is too long), publishing stops with the same message sync would
   record. A published file therefore always indexes cleanly.
2. `ContentStore.commit` writes the file, if it still has `base_sha`:

   ```ts
   yield* store.commit({
     path: 'journal/first-light.md',
     content,
     baseSha: copy.baseSha, // null: the file must not exist yet
     message: 'Publish journal/first-light',
     author: { name: 'Ann Lee', email: 'ann@example.com' }
   });
   // → { sha: '4b1e…' } or Conflict { path, sha }
   ```

3. The index takes the committed content at once: the entry is saved, the
   file is marked with its new SHA (so the next sync skips it), and the copy
   is deleted.

```bash
curl -X POST $API/admin/collections/journal/entries/first-light/publish \
  -d '{"revision":4}'
# → IndexedEntry, or 409 Conflict, EditedElsewhere or SlugTaken
```

**Conflict.** The file changed outside Venda after the copy was taken (an
agent pushed, someone edited on disk). The editor shows the file's current
fields beside the copy, with two actions:

- **Keep editing mine:** takes the new SHA as the copy's base. The next
  publish replaces the outside change.
- **Discard mine:** deletes the copy and opens the file as it is now.

Sync also flags copies whose base differs from the file's SHA, so the warning
shows when the entry opens, before anyone presses Publish.

**New entries.** "New" in a collection asks for a title and derives the slug
from it (editable, checked against files and other copies). The copy has no
base SHA, so a file that appears meanwhile at that path is a conflict, never
overwritten. A single collection's one entry is created the same way, as
`index`.

## Content stores

| Store | Writes |
| --- | --- |
| Local content server | `PUT /files/<path>` with `If-Match: <sha>` (`If-None-Match: *` for a new file); `412` becomes `Conflict`. The file is written to disk, so the version moves and the developer commits as usual. |
| Bundled (deployed until slice 4) | none. `commit` fails with `ContentReadOnly`; the admin keeps Save and shows Publish as unavailable, with the reason. |
| In-memory (tests) | compares SHAs the same way |

## Capabilities

| Role | Edits | Publishes | Creates |
| --- | --- | --- | --- |
| Administrator, Editor | every entry | every entry | yes |
| Author | entries they own | entries they own | yes |
| Contributor | entries they own | no | yes |

- Owning an entry is operational state: an `entry_owners` row written when
  someone creates the entry in the admin. A file that arrives from the
  repository has no owner until an editor assigns one.
- `CanEditEntry` and `CanPublishEntry` are gdp-ts proofs minted in
  `core/auth/proofs/` from the person's role and the entry's owner. The save,
  discard and publish functions demand them. `CanBrowseContent` extends to
  show authors and contributors their own unpublished copies.
- A contributor's copy waits for an editor, who publishes it.

## Admin

**Fields.** The `field` slot: a plugin lists `fields`, each an input
component for one field type, chosen the way views are (last registered wins).
`@venda/fields-core` ships text, textarea, number, toggle, date and time,
tags, URL, select and JSON, plus text inputs for image and relation until the
media library and relations land. `VendaDateTimeInput` becomes the
`datetime` field.

**Form editor** (`venda.form`, in `@venda/editor-form`): each field in its
field plugin's input, the save state in the entry bar, and publishing errors
beside the field they name.

**Writer** (`@venda/editor-writer`, `venda.writer`): the Focus prototype's
canvas (title, body, `+` and `/` menus, selection toolbar) and its details
panel, editing the copy. It edits the nodes `@venda/content` round-trips
today. A block tag it has no node for stays an opaque, movable block, so
nothing in the file is lost. The prototype routes and their files are deleted
once the writer passes its suites.

**Entry bar.** One status string and at most two actions, per redesign.md:

- "Published", "Saving…", "Saved", "Changes not published" or "Changed
  outside Venda".
- Publish (or Publish changes), and a menu with Discard changes.

**Settings → General** edits the site name, address and screen descriptions,
and publishes them to `site.ts` the same way, through a canonical printer for
`defineSite` in `@venda/content`.

## Verification

- **Core tests:** save and revision guard; publish writes exactly the
  serialized file; a publish that sync would reject is refused with sync's
  message; conflict on a changed or newly created file; the index updates
  without a sync; each role's proofs (and `test/mistakes.ts` cases that must
  not compile).
- **Live suites (workerd):** the API flow against the local content server,
  including a conflict made by editing the file on disk.
- **Browser suite:** type in the writer, see "Saved", reload and find the
  text; publish and read the new file from disk and from the public API; edit
  the file on disk and get the conflict view; a contributor saves but cannot
  publish; an author cannot open another person's entry for editing; a new
  record and the single entry are created and published.
- **`try/slice-3.html`:** buttons for save, publish, outside edit (the try
  server rewrites the file on disk) and conflict, each showing the request,
  the response, and the file before and after.

**Done** when an editor can create, edit and publish every kind of entry and
the site settings on local workerd, a deployed server says why it cannot
publish, conflicts never overwrite, every role meets its capabilities, and
the gate, all suites and the try page pass.

## Delivery

Five commits, each green on `pnpm check` and `pnpm e2e`, each extending
`try/slice-3.html`:

1. Core and API: copies, publish, conflicts, stores, capabilities.
2. Fields and the editable form editor (records, single).
3. The writer plugin; prototype removed.
4. New entries and the list statuses.
5. Settings → General writes `site.ts`.

## Open questions

- **Owners for repository files.** Unowned files stay with editors and
  administrators until one is assigned. The alternative reads an `author`
  relation field as the owner when the model has one.
- **One copy per entry or one per person.** One shared copy with the revision
  guard matches Ghost and keeps a single source of "what will publish".
  Per-person copies avoid stepping on each other, at the cost of merging.
- **Contributor hand-off.** Editors find contributors' copies by the "Changes
  not published" status. An explicit "Ready for review" state could come with
  the slice 5 lifecycle instead.
