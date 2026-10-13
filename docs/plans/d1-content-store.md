# The D1 content store and the agent CLI

Status: **approved**; part 1 done. Builds on
[architecture.md](../architecture.md).

Content lives in D1 as files: each entry a Markdown file, each model a
`config.ts`, the site's settings `site.ts`, held as text in a table with its
git blob SHA. The parsers, validation, index and editors keep working on
those files. Every published version is kept. Publishing is one atomic D1
batch: the file, its revision, its index rows and the working copy change
together, or not at all.

Agents, scripts and developers change content and settings through a CLI
over the same API: `venda pull` writes the content as a folder, and
`venda push` sends back what changed, applied atomically and refused when
anything was edited meanwhile.

## Scope

In:

- `content_files` and `content_revisions` as the content's only home.
- One-batch writes for publish, Settings → General and the files API.
- A files API and the `venda` CLI: pull, push, history, restore, site
  settings and entries, authenticated with API tokens.
- Import and export between D1 and a content folder.
- Local development and `pnpm try` on D1 seeded by import.
- Removal of the GitHub store, webhooks, the minute task, the simulator, the
  folder content server, the bundled store and the sync machinery.

Out:

- Scheduling, trash, preview and search (slice 5); history becomes its
  revisions view.
- The model editor in the admin (slice 6); models change through the CLI.
- Media in R2, and deployment commands (slice 7).

## Schema

| Table | Columns | Holds |
| --- | --- | --- |
| `content_files` | `path` PK, `text`, `sha`, `size`, `updated_at`, `updated_by` | the current files |
| `content_revisions` | `id`, `path`, `sha`, `text` (null for a deletion), `parent_sha`, `message`, `author_id`, `author_name`, `created_at` | every published version, kept indefinitely |
| `content_collections`, `content_entries`, `content_site`, `content_problems` | as today | the index, derived from `content_files` in the same batch as each write |
| `content_work` | as today, without the publish-intent columns | shared working copies, owners, the revision guard |
| `content_guard` | `ok` with `CHECK (ok = 1)`, never holding a row | aborts a batch whose condition fails |

- `sha` stays the git blob SHA, so exports match what git would compute and
  conflicts behave as today.
- A file is at most 1 MB (D1 allows 2 MB per row). Revisions are not pruned.

## Writes

Every write is one batch that opens with a guard on each file's base:

```sql
INSERT INTO content_guard (ok) SELECT (SELECT sha FROM content_files WHERE path = ?) IS ?;
INSERT INTO content_files … ON CONFLICT(path) DO UPDATE SET …;
INSERT INTO content_revisions (path, sha, text, parent_sha, message, author_id, …) VALUES (…);
INSERT INTO content_entries … ON CONFLICT(path) DO UPDATE SET …;
UPDATE content_work SET base_sha = ?, dirty = 0, revision = revision + 1 WHERE … AND revision = ?;
DELETE FROM content_guard;
```

- A guard that fails aborts everything: the answer is `Conflict` with the
  file's current SHA.
- Publish keeps its contract: `POST …/publish {revision}` answers the
  published copy, or `Conflict`, `EditedElsewhere` or `InvalidContent`.
- Content is validated before the batch with the same readers the index
  uses, so the API never stores a file the index would reject. A model change
  re-reads its collection's entries in the same batch. An entry that no
  longer fits its model is listed in Content problems, as today.
- Settings → General writes `site.ts` the same way.

## Files API

A protected contract group for administrators and editors (API tokens or a
session; the existing capability proofs decide):

```bash
venda pull ./content                       # every file, plus .venda/shas (path → SHA it was pulled at)
venda push ./content -m "Retitle posts"    # changed, new and deleted files, in one batch
# → 3 files published (rev 412)  or  Conflict: journal/first-light.md changed since you pulled
venda history journal/first-light.md       # revisions, newest first
venda restore journal/first-light.md --to 9f2c…
venda site set name="Hill Notes"           # reads site.ts, writes it back with its SHA
venda entry get journal first-light --json
venda entry publish journal first-light --title "First light" --body-file body.md
```

- `GET /api/admin/files` lists paths, SHAs and sizes; `GET /api/admin/files/<path>`
  returns one file's text and SHA; `GET …/<path>/revisions` its history.
- `POST /api/admin/files` takes `{ message, changes: [{ path, text | null,
  baseSha | null }] }`, at most 1 MB a file and 200 files a call, and applies
  them all in one batch or none. `null` text deletes; a `null` base creates.
- Every command prints JSON with `--json`, exits non-zero on failure, and
  names the conflicting paths, so an agent can pull, merge and push again.
- An open working copy of a file changed this way shows "Changed outside
  Venda" in the admin, as with any outside change.
- `venda login --url … --token …` stores the URL and token in the user's
  config directory; `VENDA_URL` and `VENDA_TOKEN` override it.

## Import, export and local development

- `venda import ./content` pushes a folder in batches of 200 files. A file
  the index cannot read is stored and listed in Content problems, so nothing
  in an existing folder is lost on the way in.
- `venda export ./content` writes the current files as the folder layout.
- `pnpm try` and the e2e suites start on fresh local D1 seeded by import from
  `try/content` and `e2e/fixtures/content`; `pnpm try` keeps its data between
  runs and imports only into an empty database. The try page's "outside edit"
  helper becomes a `venda push`.

## Removal

- `server/src/github/`, `server/tasks/`, the scheduled task config,
  `scripts/github-simulator.*`, `scripts/github-contract-setup.mjs`,
  `e2e/github.*`, `try/slice-4.html`'s GitHub checks and `docs/plans/slice-4-github-store.md`.
- `scripts/content-server.mjs`, `content-writes.mjs`, `local-content.ts`, the
  bundled `assets:content` mount and `filesStore`.
- `sync.ts` as a runner, `source-state.ts`, `freshness.ts`, `content_source`
  and the `generation` column, and the publish-intent columns.
- The private `StevenJPx2/venda-contract-test` repository and the
  `venda-contract-stevenjpx2` App, which you delete in GitHub's settings.

## Verification

- **Core:** publish, site and files writes are atomic and conditional (a
  stale base changes nothing); a model change re-reads its entries; a deletion
  leaves a revision; import keeps unreadable files as problems; export
  round-trips byte for byte.
- **Concurrency:** two publishes of one entry, two pushes touching one file,
  a push racing an admin publish, and a push racing a model change. Exactly
  one wins each time, and the other gets `Conflict` or `EditedElsewhere`.
- **Live (workerd):** the CLI against a running Worker with an API token:
  pull, edit, push, conflict, history, restore, site settings, an author's
  token refused for files.
- **Browser suite:** unchanged flows still pass; an entry changed by a push
  shows "Changed outside Venda".
- **`try/slice-4.html`:** the CLI's commands with their output, and
  pass/fail checks for push, conflict, history and restore.

## Delivery

1. **Done.** The store: schema, one-batch writes for publish and site,
   revisions, import; the files API (list, read, write, import) and its
   `CanEditFiles` proof; local, try and the live suites on D1; removal of the
   GitHub, folder and sync code.
2. The `venda` CLI (login, pull, push, history, restore, site, entry,
   import, export), the revisions endpoints it needs, the live CLI suite and
   `try/slice-4.html`.
