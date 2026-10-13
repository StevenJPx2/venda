# Venda architecture

Status: **approved** (2026-10-05). This replaces the "Architecture decisions"
in [roadmap.md](roadmap.md); the admin's look and behaviour stay in
[redesign.md](redesign.md).

Venda is a **file-first CMS**. Content and data models are files: one folder
per collection, a `config.ts` describing its fields, and a Markdown or MDX
file per entry. The files live in D1, each with its git blob SHA and every
version it has had, next to an index derived from them in the same write, so
the admin, the public API, search, scheduling and previews work without
rebuilding the site. Editors work in the admin; developers and agents work on
the files through the `venda` CLI (`pull`, `push`), and both are held to the
same rule: a change made from an old read is refused, never written over.

## Principles

1. **Files are the source of truth.** `content_files` holds them;
   everything else about content is either derived from them in the same
   write (the index) or operational state that is not content: sessions,
   autosaved working copies, schedules.
2. **Content files are data, never code, at runtime.** The server parses
   `config.ts` and entries; it never executes anything from them.
3. **One contract.** Every wire shape is defined once, in Effect Schema, in
   `@venda/contract`. The server, admin, Nuxt module, CLI and MCP server all
   use it; no package re-declares an `Entry` type.
4. **The core knows nothing about its host.** Domain logic depends on Effect
   services. Nitro and Cloudflare appear only in adapters.
5. **The admin is a shell; almost everything else is a plugin.** Editors
   (including the Ghost-style writer), blocks, fields, browse views, pages
   and settings sections ship as a default preset built through the same API
   third-party plugins use.
6. **Every write and job is bounded.** A write takes at most 200 files, and
   scheduled work and retries have per-run limits and resumable cursors.

## Content files

The files keep this layout in D1, in exports and in `venda pull`:

```
venda.config.ts               instance settings and plugins (build time)
content/
  site.ts                     the site's name, address and admin copy
  blog/
    config.ts                 the collection's model
    why-we-moved.mdx
    autumn-roadmap.md
  authors/
    config.ts
    ann-lee.md
  home/
    config.ts                 kind: 'single'
    index.md
```

### Collection model: `config.ts`

```ts
import { defineCollection } from 'venda';

export default defineCollection({
  name: 'Blog',
  description: 'Notes and announcements, newest first.',
  kind: 'posts',
  previewUrl: 'https://example.com/blog/{slug}?preview={token}',
  fields: {
    title: { type: 'text', required: true },
    excerpt: { type: 'textarea', max: 300 },
    tags: { type: 'tags' },
    author: { type: 'relation', to: 'authors' },
    cover: { type: 'image' },
    body: { type: 'richtext' }
  }
});
```

- The file must default-export one `defineCollection(...)` call whose argument
  is a literal: strings, numbers, booleans, arrays and objects. No variables,
  spreads, calls, template strings or type annotations. That restriction is
  what lets the server read it as data. A file that breaks it is rejected with
  the line and reason.
- `defineCollection` returns its argument unchanged; it exists for editor
  autocompletion and type inference.
- The admin edits a model by rewriting the file in a canonical format.
  Comments inside the object are not preserved.
- `kind` is `posts`, `pages`, `single` or `records` (see redesign.md). A
  `single` collection has exactly one entry, `index.md`.
- `description` (optional, at most 300 characters) says what the collection
  holds, in the owner's words. The admin shows it under the collection's name
  and on its row in Content; without one it shows nothing in its place, never
  text of its own.
- `view` and `editor` (optional) name the admin plugins that browse the
  collection and open its entries, in place of its kind's defaults (see
  "Admin and plugins"). For example, `view: 'venda.table'` shows posts as a
  table.
- A collection has at most one `richtext` field. It is stored as the file
  body; every other field is frontmatter.

### Site settings: `site.ts`

```ts
import { defineSite } from 'venda';

export default defineSite({
  name: 'SAFT',
  url: 'https://saftapologetics.com',
  screens: {
    'content.index': 'Everything SAFT publishes.',
    'accounts.tokens': ''
  }
});
```

- Read as data under the same rules as `config.ts`, indexed in the write
  that changes it, and reported in Content problems when invalid. Every
  setting is optional; an invalid or missing file leaves all of them empty.
- `name` (at most 60 characters) replaces Venda's mark in the sidebar and
  names the window titles ("People · SAFT"). Without it they say Venda.
- `screens` gives a screen's description by its page id (at most 300
  characters), replacing the one its plugin ships; an empty string shows
  none. The shell's Settings page is `settings`. Settings → General lists
  every screen with its id, its words and where they come from, including
  ids no installed screen has.
- `GET /api/site` serves the settings without signing in, so a site can read
  its own name and address.

### Entry: `<slug>.md` or `<slug>.mdx`

```md
---
title: Why we moved our CMS to the edge
excerpt: Median time to first byte fell from 900ms to 120ms.
tags: [engineering, infrastructure]
author: ann-lee
cover: https://media.example.com/2026/10/edge.jpg
publishedAt: 2026-10-04T09:00:00Z
---

For three years every page on our site was rendered in a single region.

<Callout tone="info">If the content is the same everywhere, there is no reason for it to live in one place.</Callout>
```

- The file name is the slug. Locales later become `<slug>.<locale>.md`.
- A file is published unless its frontmatter says `draft: true`. Agents use
  that for unfinished work; the admin's autosaved working copies are not files.
- The body is Venda's MDX subset: CommonMark, GFM (tables, strikethrough,
  task lists, autolinks), inline `<sup>`/`<sub>`, and JSX elements whose names
  are registered blocks, with literal attribute values. No `import`, `export`
  or `{expressions}`. An unknown tag is kept as an opaque block, never dropped.
- Venda writes `.mdx` when an entry contains a block tag and `.md` otherwise.
- The editor and the API keep using the rich-text document (ProseMirror JSON)
  from `@venda/richtext`; Markdown is the storage format. Conversion is
  canonical, and round-trip tests (including SAFT's 54 entries) guard it.

## Where each fact lives

| Fact | Source of truth | Copy |
| --- | --- | --- |
| Collection models | `*/config.ts` in `content_files` | `content_collections` |
| Site name, address and admin copy | `site.ts` in `content_files` | `content_site` |
| Published and file drafts | `.md` / `.mdx` in `content_files` | `content_entries`: frontmatter, body document, search text, references, file SHA |
| Every version of every file | `content_revisions` | none |
| Working copies and owners | `content_work` | none |
| Schedules, trash tombstones, preview tokens | database | none |
| Users, roles, invitations, API tokens | database | none |
| Sessions | key-value store | none |
| Media | object store (R2) | `media` table |
| Instance settings and plugins | `venda.config.ts` (read at build) | none |

## Flows

1. **Save.** The editor autosaves the working copy to `content_work`.
2. **Publish.** The core serializes the working copy to a file and writes it
   from the copy's base SHA: the file, its revision, its index rows and the
   clean copy are one atomic batch. If the file changed since (an agent pushed
   meanwhile), nothing is written: the answer is `Conflict`, and the editor
   shows the outside change instead of overwriting it.
3. **Outside edit.** `venda push` (the files API) writes a set of files the
   same way, each from the SHA it was pulled at: all of them, or none and
   `Conflict` naming the first that moved. The index follows in the same
   batch; working copies based on an older SHA show "Changed outside Venda".
4. **Schedule.** The minute tick publishes due entries the same way as (2).
5. **Unpublish** sets `draft: true` in the file. **Trash** deletes the file;
   its revisions keep every version, so it can be restored.
6. **Edit a model.** Writing `config.ts` re-reads every entry of its
   collection in the same batch. Entries are not rewritten; entries that no
   longer fit are listed in Content problems.
7. **Import and export.** `venda import` brings a folder in, 200 files a
   batch, keeping files the index cannot read as problems; `venda export` and
   `venda pull` write the files back out in the same layout.
8. **Local development.** The Worker runs on local workerd with local D1;
   `pnpm try` and the live suites import their content folder into an empty
   database.
   - `pnpm try` watches admin, Worker and CLI sources. Builds run one at a
     time, with another pass for edits made during a build.
   - New builds use inactive output folders. Only successful builds replace
     the running Worker or CLI; a failed build leaves the last working one.
   - The page server stays running through Worker restarts. It tells open
     pages when to reload, and asks before reloading a page with entered text.
   - Local D1, sessions and the agent's folder survive hot restarts. Type `r`
     and press Enter to rebuild everything; `--fresh` resets data only when
     starting a new run.

## Packages

| Package | Role | Depends on |
| --- | --- | --- |
| `@venda/contract` | Effect Schema entities and the `HttpApi` definition; typed client and OpenAPI. Browser-safe. | `effect` |
| `@venda/richtext` | Rich-text document types, validation, HTML rendering with block renderers. | none |
| `@venda/content` | The file format: `config.ts` reader and printer, field definitions, frontmatter, Markdown/MDX to and from documents, block specs. | `@venda/richtext` |
| `@venda/core` | Domain logic in Effect: the content files, their writes and index, working copies, auth; lifecycle, media and search as their slices land. The schema is Drizzle (`src/*/schema.ts`), migrations come from `drizzle-kit generate`. | contract, content, `effect`, `drizzle-orm` |
| `@venda/server` | Nitro host on Cloudflare Workers: the contract's routes and the admin as static assets. | core, `nitro`, `@effect/sql-d1` |
| `@venda/admin` | The browser SDK: the plugin contract, registration and route/access checks, a typed Effect API client and the injected runtime with async screen primitives. | contract |
| `apps/admin` (`@venda/admin-app`) | The Nuxt 4.6 static shell: sign-in, identity, routing, navigation, theme and shared primitives; chooses a preset and loads a plugin screen only when it is opened. | admin SDK, preset |
| `@venda/preset-default` | The default plugins below, as one install. | the plugins |
| `@venda/editor-kit` | What the editors share, as a library: the rich-text editor that keeps what it cannot edit, the Venda extensions, the link popover and the field list. | admin plugin API, richtext |
| `@venda/editor-writer` | The Ghost-style writer for `posts` and `pages`. | editor-kit |
| `@venda/editor-form` | Form editor for `single` and `records`. | editor-kit |
| `@venda/views-core` | Content: collections, entries, search, new entries, the editing frame (status, Publish, conflicts), Settings → General and file problems. | admin plugin API |
| `@venda/pages-core` | People, invitations, API tokens, your account and the join page. | admin plugin API |
| `@venda/blocks-core` | Paragraph, headings, lists, quote, code, image, divider, callout. | content, admin plugin API |
| `@venda/fields-core` | Text, textarea, number, toggle, date and time, tags, select, JSON and rich text; image and relation as text until their slices. | editor-kit |
| `@venda/nuxt` | Site module: typed reads, preview, `<VendaContent>`; can mount the server inside the site's own Nitro. | contract, richtext |
| `@venda/cli` (`venda`) | `login`, `pull`, `status`, `push`, `resolve`, `history`, `show`, `restore`, `site`, `entry`, `import`, `export`; then `init`, `types`, `build`, `deploy`. Over the files API with an API token; bundled by tsdown into one file. | contract, content |

Dependencies only point down this table. `@venda/core` never imports Nitro,
Vue or a Cloudflare type; Fallow boundary rules enforce it.

## Core

**Services** (Effect `Context` tags, provided by Layers in `@venda/server`):

| Service | Production | Local and tests |
| --- | --- | --- |
| `Database`: a Drizzle SQLite database with Effect queries, holding the content files, their index and the operational state | D1 (`drizzle-orm/effect-d1` over `@effect/sql-d1`) | local D1 under `wrangler dev`; node:sqlite (`@effect/sql-sqlite-node`) in the tests |
| `AtomicWrites`: statements all or nothing | a D1 batch | a SQLite transaction |
| `ObjectStore` | R2 through a Nitro storage mount | filesystem; memory |
| `KeyValue` | KV through a Nitro storage mount | memory |
| `Mailer` | provider adapter | captured in memory |
| Clock, Random, Logger | Effect defaults | test services |

**Errors** are tagged and specific, each declared in the contract with one
status code: `Unauthenticated` and `InvalidCredentials` (401), `Forbidden`
with a reason (403), `CollectionNotFound`, `EntryNotFound`, `UserNotFound`,
`InvitationNotFound` and `TokenNotFound` (404), `EmailTaken` and
`LastAdministrator` (409), `TooManyAttempts` (429); invalid input is a 400
from the payload's schema. Infrastructure failures (a failing query, an
unreachable store) are defects, so they surface as 500s and never as a domain
answer such as "not found". Nothing throws `HttpError`.

**Entry state** is one union instead of `status`, `publishAt`, `deletedAt` and
`hasUnpublishedChanges` flags:

```ts
type EntryState =
  | { _tag: 'Draft' }
  | { _tag: 'Scheduled'; publishAt: DateTime.Utc }
  | { _tag: 'Published'; publishedAt: DateTime.Utc; sha: string; changes: 'none' | 'pending'; unpublishAt?: DateTime.Utc }
  | { _tag: 'Trashed'; deletedAt: DateTime.Utc; lastSha: string | null };
```

**Order:** the public API serves a collection newest first. The admin orders
entries by the collection's kind (`src/content/order.ts`):
- Posts: drafts first, then the newest publish date, then undated entries.
- Pages, single and records: A to Z by title, untitled entries last.

The index stores that order as each entry's `sort_key`, so the admin pages by
`(sort_key, slug)` with an opaque cursor, and search keeps the same order.
Changing a collection's kind or title field re-reads its entries, which
rewrites their keys.

**Bounds:** a write takes at most 200 files of at most 1 MB each, in a
request of at most 25 MB; a query binds at most 90 values (D1 allows 100);
the tick keeps its per-run batch limits; media uploads are capped at 25 MB.

## Server (Nitro)

`@venda/server` is a Nitro app used only for hosting, and it runs on one
platform: Cloudflare Workers (`cloudflare_module`), in production and locally
on workerd through `wrangler dev`, with local D1 and KV. Nitro supplies the
bindings, storage mounts and server assets; `src/cloudflare.ts` names the D1
client for the Drizzle schema, which holds the content too.

**Content in D1** (`core/src/content/files.ts`, `reindex.ts`,
[plan](plans/d1-content-store.md)). Every write of content (a publish,
Settings → General, a `venda push`, an import) goes through `writeFiles`,
one atomic batch:

```sql
INSERT INTO content_guard (ok) SELECT (SELECT sha FROM content_files WHERE path = ?) IS ?;
INSERT INTO content_files … ON CONFLICT(path) DO UPDATE SET …;   -- or DELETE
INSERT INTO content_revisions (path, sha, text, parent_sha, message, author_id, …) VALUES (…);
INSERT INTO content_entries … ON CONFLICT(path) DO UPDATE SET …;  -- the index, from the files as they will be
UPDATE content_work SET … WHERE … AND revision = ?;              -- a publish's own statements
DELETE FROM content_guard;
```

- `content_guard` never holds a row: its `CHECK (ok = 1)` aborts the whole
  batch when a guard's condition is false. Each file has one on its base SHA
  (null: it must not exist); a publish adds one on its copy's revision.
- A refused batch writes nothing. A file that moved answers `Conflict` with
  its current SHA; a publish whose copy was saved meanwhile answers
  `EditedElsewhere`. Bases are also compared before the batch, so a stale
  write is told so before anything else about it.
- The index rows come from the files as the write leaves them, so a model and
  its entries can change in one write; a model change re-reads every entry
  of its collection. A file the index cannot read is refused in a publish or
  a push, and kept as a Content problem in an import.
- Every write records a revision per file, credited to the person (by the
  name they go by), with a message; a deletion is a revision with no text.
  Revisions are never pruned.
- The files API (`/api/admin/files`, `/api/admin/files/read`,
  `/api/admin/import`) is for administrators and editors (`CanEditFiles`),
  and import for administrators.

Concurrency is the batch's own: two publishes of one copy, a push racing a
publish, or two pushes touching one file each end with exactly one write and
`Conflict` or `EditedElsewhere` for the other. Core tests cover each case;
`pnpm e2e` covers them on workerd.

A Node target was built and tested until slice 2b and then removed: local
workerd already gives a faithful local runtime, and Venda deploys only to
Cloudflare. Nitro's own `nitro dev` for Cloudflare (its Miniflare runner) was
tried for hot reload and rejected: it needs Miniflare 4 where Wrangler ships 5,
and its module runner could not load the unified/unist ESM packages.

On first use the app applies pending drizzle-kit migrations (each one atomic:
a batch on D1, which has no transactions; a transaction on the tests'
SQLite), then serves the contract. Recurring work will run as Nitro
`scheduledTasks` (Cron Triggers on Workers) when a slice needs it.

## Admin and plugins

Plugins are chosen in `venda.config.ts` and bundled into the admin by
`venda build`. They are ordinary packages the site owner installs and trusts;
the admin never loads code at runtime. Server-side plugins with sandboxing
remain roadmap step 10.

```ts
import { defineVenda } from 'venda';
import writer from '@venda/editor-writer';
import blocks from '@venda/blocks-core';
import fields from '@venda/fields-core';
import youtube from 'venda-block-youtube';

export default defineVenda({
  plugins: [writer(), blocks(), fields(), youtube()]
});
```

**The shell** owns only what must be fixed points: sign-in, sessions and
capability checks (plugins declare the capability they need; the server still
enforces it), routing, the navigation frame, theme tokens, shared primitives
(toasts, dialogs, the command menu), the API client and the plugin host.
Everything else, including Venda's own features, is a plugin in
`@venda/preset-default`. A site can drop a plugin or replace it.

A plugin contributes to these slots and nothing else:

| Slot | Contributes | Example |
| --- | --- | --- |
| `editor` | The screen for editing an entry of a collection kind | writer, form |
| `block` | A rich-text block | callout, YouTube embed |
| `field` | An input for a field type | date and time, relation |
| `view` | How a collection is browsed | posts list, records table |
| `page` | A whole route | media library, analytics |
| `nav` | A navigation item | Media |
| `settings` | A settings section | Team, API tokens |
| `panel` | A section of the editor's sidebar | SEO, "linked from" |
| `action` | A command on an entry | Duplicate, send as newsletter |

Rules for plugins:

- Plugins never import each other. Editors read the block and field
  registries, so any block works in any editor that renders rich text.
- Each plugin's screens are loaded when first opened, so installing plugins
  does not slow the admin's start.
- The admin requests nothing outside its own origin. Icons are bundled at
  build time from the names written in the shell, the plugin packages and
  Nuxt UI (`icon.provider: 'none'`), never fetched from Iconify's API, so a
  plugin names its icons literally. The browser suite fails on any request
  to another origin.
- The plugin API stays marked unstable until the default preset has been built
  entirely through it. Venda's live suites run against the default preset plus
  one test plugin installed from outside the repository.

In detail:

- **Page:** each plugin has an id and pages, each with
  an id, a path of named segments, a title, access (`public`, `signed-in`,
  `administrator`), a section (`content`, `settings`, `account`, `public`), an
  optional description, an optional navigation entry (label, icon) and a lazy
  `load()`. The description shows under the screen's title and beside its
  link on the Settings page, unless `site.ts` words it differently.
  The section decides where the shell lists a page:
  - Content pages: the sidebar. A page whose entry has `items` becomes a
    sidebar heading with those links beneath it, loaded on each navigation:
    Content lists one link per collection, grouped by kind (posts and pages,
    then single, then records) and A to Z by name within a group, with a gap
    between groups. The Content page lists collections in the same order.
  - Settings pages: the Settings page, a single link at the foot of the
    sidebar, with their descriptions. Each section page leads back to it.
  - Account pages: the account menu, which collapses your name and role into
    one button with Sign out.

  A role sees only the pages it may open, and Settings is hidden when there
  are none. `apps/admin/app/utils/plugins.ts` selects `@venda/preset-default`,
  which composes the views, the writer, the form, the fields and the account
  pages. Duplicate ids and equivalent route patterns are rejected at
  registration. The SDK is provisional: the block, panel and action slots
  arrive only with the slices that use them, and slice 6 finishes and freezes
  the API.
- **View and editor:** a plugin lists `views` and `editors` beside its pages.
  Each has an id, a label, the kinds it serves and a lazy `load()`. A view's
  component receives `collection`; an editor's receives `collection` and
  `edit`, an `EntryEdit`: the copy's values, whether it is read-only, and
  setters. The shell saves and publishes; an editor only reads values and sets
  them. Which one shows a collection:
  - The one its `config.ts` names with `view:` or `editor:`, whatever its
    kinds.
  - Otherwise the last registered one serving the collection's kind, so a
    site plugin listed after the default preset replaces a default.
  - A name no installed plugin provides is reported on the screen, and the
    kind's default shows the collection instead.

  The default preset's views and editors:
  - `venda.list` (posts, pages): rows with title, status and, when dated, the
    day.
  - `venda.table` (records): the title column, then the next three fields in
    `config.ts` order, leaving out the rich-text body.
  - `venda.single` (single): opens the collection's one entry straight away,
    in its editor.
  - `venda.writer` (posts, pages): the title and body on a canvas, formatting
    on selection, `/` and `+` to insert blocks, a grip to move, turn into,
    duplicate or delete one; every other field in the details panel beside it
    (a sheet on narrow screens).
  - `venda.form` (single, records): each field in `config.ts` order, in the
    input installed for its type.

  Rich text keeps what the editor cannot edit. Before a document is edited,
  any node or mark the editor's schema lacks (a block tag, a subscript) is
  wrapped whole in a kept node, shown as itself, and unwrapped unchanged on
  save. A document the editor would still alter opens read-only.
- **Block:** a framework-free spec (`defineBlock`: name, which is also its MDX
  tag; attribute Schema; whether it holds inline text, blocks or nothing; an
  HTML renderer) plus an admin part (TipTap node, Vue node view, its entry in
  the `/` and `+` menus and in "Turn into"). Markdown-native blocks such as
  headings and lists are blocks too, so the writer has no hard-coded list.
- **Field:** the input for a field type. A plugin lists `fields`, each with
  the types it edits; the last registered input for a type is used. Its
  component receives `field`, `modelValue` and `readonly`, and emits
  `update:modelValue`; emitting null unsets the field, which then stays out of
  the file.

On sites, `renderHtml` uses each block's HTML renderer, and framework
renderers such as `<VendaContent :components>` can replace any block with a
site component. An unknown block renders its text content, never raw markup.

## Quality gate

`pnpm check` runs, and must pass with zero warnings:

1. Formatting: Prettier (`prettier --check`), 80 columns, single quotes, no
   trailing commas. `pnpm lint:fix` (or `pnpm format`) applies it.
2. Oxlint with the vendored anti-slop rules and `max-lines-per-function: 70`
   for TypeScript packages; Nuxt ESLint stays for the Vue apps.
3. Type checking (strict, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`).
4. Effect Language Service diagnostics.
5. Vitest, including contract tests for each adapter.
6. Fallow audit, including package boundaries.

`pnpm e2e` builds the real Worker and runs it on local workerd and D1, with
the fixture content (and, for the admin, a thousand more entries) imported,
and drives the API and the admin; it is required before every commit that
changes behaviour.

Oxlint with anti-slop (vendored in `tools/oxlint/anti-slop`, provenance in its
`UPSTREAM.md`) and the Fallow gate (`scripts/fallow-gate.mjs`) cover the
packages listed in `tools/new-architecture.json`. A package joins that list
when its slice rewrites it; until then it stays on ESLint, and Oxlint's
default rules apply everywhere with warnings denied. The gate never loosens
for a listed package.

Code follows the code-breathing-room convention: blank lines group the
statements of one phase; every braced block and every `if` (one-line guards
included) gets a blank line above and below, with a run of consecutive guards
kept together as one paragraph; and scopes never start or end with a blank
line. Consecutive variable declarations may stay grouped.

Prettier owns layout: indentation, wrapping and line breaks, in code and Vue
templates alike. ESLint owns only the blank-line rhythm, which Prettier keeps
but never adds: `@stylistic/padding-line-between-statements` for statements
and, in templates, `vue/padding-line-between-tags`, which separates multiline
sibling sections and components with one blank line while adjacent leaf
controls may stay grouped. `eslint-config-prettier` turns off every rule that
would fight Prettier. Prettier removes a blank line directly after a multiline
opening tag and at the edges of blocks, so those gaps are not used. `pnpm
lint:fix` runs Prettier, then the ESLint and Oxlint fixes, then Prettier again:
a blank line ESLint adds beside a wrapped inline tag can let Prettier unwrap
it, and Prettier itself can lay out a long method chain differently on a
second pass. `scripts/spacing.test.mjs` proves the pipeline settles on Vue
samples that broke a single pass. Grouping by phase is checked in review.

Wrapping at 80 columns makes code taller, and the gate's size and duplication
limits apply to the result: a test group that outgrew 70 lines is split by
topic, and code that only looked distinct on one long line is shared.

## Delivery

Venda is greenfield: the build happens on `platform`, one vertical slice at a
time, each through its real boundary with every live suite green before the
next. Nothing is kept for compatibility. The first-generation backend
(`apps/api`, the promise-based core, `@venda/schema`, the deploy CLI and their
suites) and every admin screen except the Focus editor prototype were deleted
when slice 1 landed; each feature returns when its slice builds it on this
architecture.

**Every slice ships a way to try it.** A slice is not done until `pnpm try`
starts what it delivers, and `try/slice-N.html`
(listed on `try/index.html`) lets a person exercise it: plain HTML with one
button per behaviour, showing a clear pass or fail and the raw requests and
responses, on every runtime the slice touches. The page complements the live
suites; it does not replace them.

0. **Gate and skeleton.** Oxlint, Fallow and Effect diagnostics in the gate;
   `@venda/contract`; `@venda/server` on Nitro presets. Measures the Worker
   bundle (budget: 1 MB gzipped). **Done:** `/api/health` from the contract.
1. **Read path.** `@venda/content` (config reader, Markdown/MDX conversion,
   round-trip tests), the local content store, sync into the index, and the
   public content API served from files. **Done:** configs are read as data and
   entries as frontmatter plus Markdown with block tags (every SAFT document
   round-trips); the index is a Drizzle schema migrated at startup; sync diffs
   git blob SHAs, reads at most 200 files per run and records unreadable files
   in `content_problems`; `/api/content/<collection>[/<slug>]` serves
   `PublicEntry` (`collection`, `slug`, `publishedAt`, `data`) with typed 404s.
   Node watches its `content/` folder; Workers serves the folder bundled at
   build time until slice 4. The Worker is 510 kB gzipped.
2. **Auth and users.** Sign-in, sessions, roles and capabilities, invitations
   and API tokens, built on Effect with their own suites. **Done:** the
   `auth`, `users`, `invitations` and `tokens` groups, with an
   `Authentication` middleware that accepts a bearer API token or the
   `venda_session` cookie (HttpOnly, Secure, SameSite=Lax; refused on
   changing requests from another Origin). Sessions live in the `kv` storage
   mount (Workers KV, files on Node) under the SHA-256 of their secret; every
   request re-reads the person, and a per-user session epoch ends all their
   sessions when their password, role or status changes. Passwords are
   PBKDF2-SHA256 (100,000 iterations, the Workers cap); ten failed sign-ins
   lock an email for fifteen minutes. The recovery owner
   (`VENDA_OWNER_EMAIL`, `VENDA_OWNER_PASSWORD`) always signs in as an active
   administrator. Capability checks are compile-time proofs (gdp-ts): the
   core's sensitive functions demand `IsAdministrator`, `InvitationIsOpen`,
   `OwnsToken`, `SignedInInPerson` or `PasswordConfirmed`, minted only in
   `packages/core/src/auth/proofs/`; Oxlint's gdp-ts preset (strict in the
   core and server) forbids forging them, and `test/mistakes.ts` holds code
   that must not compile. "An administrator remains" is a guarded update
   instead, since a proof would be stale under concurrent demotions. The
   Worker is 524 kB gzipped.
2b. **Admin catch-up.** Pull the shell and plugin host forward and build the
   slices above as real UI. **Done:** the admin is a static Nuxt build served at
   `/admin/` by `@venda/server` on the API's own origin, so there is no second
   production server. Deep links fall back to the shell with `no-store`, while
   a missing asset stays a 404 and is never answered with HTML. Screens exist
   for collections, cursor-paged entries, search, the entry view, file
   problems, people, invitations and their public join links, passwords, tokens
   and your account. Content is read-only until slice 3.
   `adminContent` is a protected contract group, and the `CanBrowseContent`
   proof carries the case: administrators and editors see every file,
    authors and contributors see published files and entries they own;
    only administrators see repository problems.
   Playwright drives the real UI on both presets: sign-in, an invited author in
   a private context, token creation and revocation, disabling someone, mobile
   navigation at 390px and a thousand-entry collection with long non-Latin
   titles. `try/slice-2b.html` links to the actual admin and checks its serving
   and API boundaries rather than pretending to test the UI. From here every
   slice ships API, admin plugins and a try page together.
3. **Write path.** Working copies, publish to files, conflicts
   ([plan](plans/slice-3-write-path.md)). **Done:**
   - A shared copy per entry with a revision that never resets, conditional
     saves, and discard. Autosave sends one save at a time; Publish, Discard
     and leaving the screen wait for it, and refuse if it failed.
   - Owner assignment by editors; authors edit and publish entries they own;
     contributors save theirs for an editor to publish. Anyone else reads an
     entry read-only.
   - A frozen publish intent, SHA-conditional store writes and atomic index
     finalization. Retries finish an uncertain publication; conflicts keep the
     copy until the person keeps theirs or takes the file's. Finalization
     checks the current collection model and records a content problem if an
     outside model change makes the published file invalid.
   - New entries from the admin: a copy owned by its creator, with no file
     until published, and never written over a file that appeared meanwhile.
     Lists show them first, paged with the files; a discarded one keeps its
     revision so a stale tab cannot revive it.
   - The writer and form editors, the field slot with `@venda/fields-core`,
     and Settings → General writing `site.ts`.
   - Local writes through a token-authenticated folder server, limited to 1 MB.
     The bundled store is read-only, with a typed publishing error.
   - `try/slice-3.html`: steps for the real admin, a title-editing console,
     and checks for save, publish, an outside edit, a new entry and General.
4. **The D1 content store and the agent CLI**
   ([plan](plans/d1-content-store.md)). **Done:**
   - The files live in `content_files` with every version in
     `content_revisions`; every write is one guarded batch with its index.
   - Publish, Settings → General, the files API and import all write that
     way; the GitHub, folder-server and sync code is removed.
   - `pnpm try` and the live suites import their content into D1.
   - The `venda` CLI (`packages/cli`): pull, status, push, resolve, history,
     show, restore, site, entry, import and export, with an API token.
   - `try/slice-4.html`: the commands to run from a terminal, a console that
     runs the real CLI, and checks for pull, push, a stale push, restore,
     settings and entries.
5. **Lifecycle on files.** Scheduling, unpublish, trash and restore from
   revisions, preview, search.
6. **Finish and freeze the plugin API and the default preset.** Every screen
   arrives as a plugin from slice 2b on. What is left: the model editor that
   writes `config.ts`, any remaining slots, and one external test plugin
   installed from outside this repository, then the API is frozen.
7. **CLI and deployment.** `init`, `types` from `config.ts`, `deploy`; the
   hosted deployment moves to `@venda/server`.

Roadmap steps 5 to 12 then continue on this base.

## Content from elsewhere

- The hosted instance's blog posts are written as files once and imported.
- SAFT's Sanity migration script writes a content folder, then
  `venda import` brings it in.

## Dependencies (approved)

Production:

| Package | Version | Used by | Why |
| --- | --- | --- | --- |
| `effect` | 4.0.1 | contract, core | Schema, typed errors, services, `HttpApi` with typed client and OpenAPI |
| `mdast-util-from-markdown`, `mdast-util-to-markdown` | 2.1.0, 2.2.0 | content | Markdown parsing and canonical printing |
| `micromark-extension-gfm`, `mdast-util-gfm` | 3.0.0, 3.1.0 | content | Tables, strikethrough, task lists, autolinks |
| `micromark-extension-mdx-jsx`, `mdast-util-mdx-jsx` | 3.0.2, 3.2.0 | content | Block tags without the rest of MDX |
| `yaml` | 2.9.1 | content | Frontmatter |
| `acorn` | 8.18.0 | content | Reading `config.ts` as data without executing it |
| `nitro` | 3.0.260903-beta | server | Hosting and presets (see risks) |
| `drizzle-orm` | 1.0.0-rc.5-5935859 | core, server | Index schema and typed Effect queries (rc.4 calls an Effect beta API renamed in 4.0.0) |
| `@effect/sql-d1` | 4.0.1 | server | The SQL client behind Drizzle's D1 driver (`@effect/sql-sqlite-node` for the tests) |
| `@gdp-ts/core` | 0.1.0 | core, server | Capability checks as compile-time proofs, and its Oxlint preset |
| `nuxt`, `@nuxt/kit`, `@nuxt/schema` | 4.6.0 | admin, landing, nuxt | Exact pins, for the portable `nuxt/server` API and its CLI |

Development: `prettier` 3.9.9 with `eslint-config-prettier` 10.1.8,
`oxlint` and `@oxlint/plugins` 1.86.0, `fallow` 3.31.0,
`@effect/language-service` 0.87.3, `drizzle-kit` 1.0.0-rc.5-5935859,
`playwright` 1.63.0 (the browser suite).

## Risks

- **Nitro 3 is in beta** (chosen over the stable `nitropack` 2.13.4 line).
  Venda pins the exact beta and only `@venda/server` depends on Nitro, so a
  regression stays in one package.
- **Nuxt's build integration is still Nitro 2.** Stock Nuxt 4.6 builds with
  `nitropack`, and native Nitro 3 integration arrives in Nuxt 5, per the
  [4.6 release article](https://nuxt.com/blog/v4-6) and the
  [server compatibility guide](https://nuxt.com/docs/4.x/guide/modules/server-compatibility).
  It costs nothing here: the admin generates static files that Venda's Nitro 3
  host serves, and new server code should use `nuxt/server` so it stays
  portable. Do not override Nuxt's Nitro dependency with another major.
- **Drizzle's Effect drivers are pre-1.0**, pinned to a commit snapshot.
  They sit behind the `Database` service; the core's tests run on the real
  node:sqlite driver and the live suites on D1. Its type declarations still
  import a beta Effect path (`effect/unstable/sql`) that resolves to nothing,
  which weakens the `SqlError` types it exposes until the next release.
- **gdp-ts is a 0.1.0.** It is small (no dependencies; names, proofs and lint
  rules), pinned exactly, and only its types reach the core's signatures; if
  it stalls, it can be vendored like anti-slop.
- **D1's limits.** A query binds at most 100 values, a row holds at most
  2 MB and a database 10 GB. Venda reads in chunks of 90, caps a file at 1 MB
  and keeps every revision; a pruning rule can follow if a site ever nears
  the size limit.
- **Markdown fidelity.** Some editor states have no Markdown form (for example
  overlapping marks); conversion normalises them, and round-trip tests define
  what is kept.
- **Worker size.** Effect, the Markdown stack and the core must fit the
  1 MB budget; slice 0 measured 254 kB gzipped before the Markdown stack.
