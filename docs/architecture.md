# Venda architecture

Status: **approved** (2026-10-05). This replaces the "Architecture decisions"
in [roadmap.md](roadmap.md); the admin's look and behaviour stay in
[redesign.md](redesign.md).

Venda is a **file-first CMS**. Content and data models live as files in the
site's git repository: one folder per collection, a `config.ts` describing its
fields, and a Markdown or MDX file per entry. A Venda server keeps a live
index of those files in SQL, so the admin, the public API, search, scheduling
and previews work without rebuilding the site. Editors work in the admin;
developers and agents edit the files. Both paths meet in git.

## Principles

1. **Files are the source of truth.** Everything in the database is either
   derived from files (and can be rebuilt from them) or operational state that
   has no place in git: sessions, autosaved working copies, schedules.
2. **Repository files are data, never code, at runtime.** The server parses
   `config.ts` and entries; it never executes anything from the repository.
3. **One contract.** Every wire shape is defined once, in Effect Schema, in
   `@venda/contract`. The server, admin, Nuxt module, CLI and MCP server all
   use it; no package re-declares an `Entry` type.
4. **The core knows nothing about its host.** Domain logic depends on Effect
   services. Nitro, Cloudflare, Node and GitHub appear only in adapters.
5. **The admin is a shell; almost everything else is a plugin.** Editors
   (including the Ghost-style writer), blocks, fields, browse views, pages
   and settings sections ship as a default preset built through the same API
   third-party plugins use.
6. **Every background job is bounded.** Sync, scheduled work and retries have
   per-run limits and resumable cursors.

## Content on disk

```
venda.config.ts               instance settings and plugins (build time)
content/
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
- A collection has at most one `richtext` field. It is stored as the file
  body; every other field is frontmatter.

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
| Collection models | `content/*/config.ts` | `collections` index table |
| Published and file drafts | `.md` / `.mdx` files | `entries` index: frontmatter, body document, search text, references, file SHA |
| Autosaved working copies | database | none |
| Revisions | git history (publishes) and database (saves between publishes) | none |
| Schedules, trash tombstones, preview tokens | database | none |
| Users, roles, invitations, API tokens | database | none |
| Sessions | key-value store | none |
| Media | object store (R2) | `media` table |
| Instance settings and plugins | `venda.config.ts` (read at build) | none |

## Flows

1. **Save.** The editor autosaves the working copy to the database. No git.
2. **Publish.** The core serializes the working copy to a file and commits it
   through `ContentStore.commit` with the file's last known SHA. The index is
   updated from the committed content at once, without waiting for a webhook.
   If the file changed since (an agent pushed meanwhile), the commit fails with
   `Conflict` and the editor shows the outside change instead of overwriting it.
3. **Outside edit.** A push to the repository reaches the server's webhook
   (signature verified). Sync re-indexes the changed paths, at most 200 per
   run, resuming from a stored cursor. Working copies based on an older SHA
   are flagged "changed outside Venda".
4. **Schedule.** The minute tick publishes due entries the same way as (2).
5. **Unpublish** sets `draft: true` in the file. **Trash** deletes the file and
   keeps a tombstone with its last SHA, so it can be restored for 30 days.
6. **Edit a model.** The admin rewrites `config.ts` and commits it. Entries
   are not rewritten; entries that no longer fit are listed in the admin.
7. **Local development.** The local content store reads and writes the
   working tree and watches it; the developer commits as usual.
8. **Rebuild.** `venda sync --full` (or the admin) rebuilds the whole index
   from the files; the index is disposable.

GitHub is the production content store. Venda acts through a GitHub App
installation, so editors need only Venda accounts; commits are authored as
"Ann Lee via Venda". Saving keeps working while GitHub is unreachable; publishing
retries and then reports the outage.

## Packages

| Package | Role | Depends on |
| --- | --- | --- |
| `@venda/contract` | Effect Schema entities and the `HttpApi` definition; typed client and OpenAPI. Browser-safe. | `effect` |
| `@venda/richtext` | Rich-text document types, validation, HTML rendering with block renderers. | none |
| `@venda/content` | The file format: `config.ts` reader and printer, field definitions, frontmatter, Markdown/MDX to and from documents, block specs. | `@venda/richtext` |
| `@venda/core` | Domain logic in Effect: content sync and reads today; auth, collections, entries, lifecycle, media and search as their slices land. The index schema is Drizzle (`src/content/schema.ts`), migrations come from `drizzle-kit generate`. | contract, content, `effect`, `drizzle-orm` |
| `@venda/server` | Nitro host: the contract's routes, the admin as static assets, any Nitro preset (Cloudflare Workers by default). | core, `nitro`, `@effect/sql-*` |
| `@venda/admin` | The admin shell and plugin host (Nuxt UI SPA). | contract |
| `@venda/preset-default` | The default plugins below, as one install. | the plugins |
| `@venda/editor-writer` | The Ghost-style writing editor (today's Focus prototype). | admin plugin API |
| `@venda/editor-form` | Form editor for `single` and `records`. | admin plugin API |
| `@venda/views-core` | Posts list, records table, media grid. | admin plugin API |
| `@venda/pages-core` | Media library, settings (general, team, API tokens). | admin plugin API |
| `@venda/blocks-core` | Paragraph, headings, lists, quote, code, image, divider, callout. | content, admin plugin API |
| `@venda/fields-core` | Text, textarea, number, toggle, date and time, tags, image, relation, JSON. | admin plugin API |
| `@venda/nuxt` | Site module: typed reads, preview, `<VendaContent>`; can mount the server inside the site's own Nitro. | contract, richtext |
| `venda` (CLI) | `init`, `sync`, `export`, `types`, `build`, `deploy`. | contract, content |

Dependencies only point down this table. `@venda/core` never imports Nitro,
Vue or a Cloudflare type; Fallow boundary rules enforce it.

## Core

**Services** (Effect `Context` tags, provided by Layers in `@venda/server`):

| Service | Production | Local and tests |
| --- | --- | --- |
| `ContentStore`: read, list, commit with base SHA, changes since a cursor | GitHub App | working tree (with watcher); in-memory |
| `IndexDb`: a Drizzle SQLite database with Effect queries | D1 (`drizzle-orm/effect-d1` over `@effect/sql-d1`) | node:sqlite (`@effect/sql-sqlite-node`); libSQL or Durable Object SQLite through their Drizzle drivers |
| `ObjectStore` | R2 through a Nitro storage mount | filesystem; memory |
| `KeyValue` | KV through a Nitro storage mount | memory |
| `Mailer` | provider adapter | captured in memory |
| Clock, Random, Logger | Effect defaults | test services |

**Errors** are tagged: `Unauthenticated`, `Forbidden`, `NotFound`, `Invalid`
(with field errors), `Conflict` (stale SHA, slug taken), `Upstream` (GitHub
or storage unavailable). The `HttpApi` maps each to one status code; nothing
throws `HttpError`.

**Entry state** is one union instead of `status`, `publishAt`, `deletedAt` and
`hasUnpublishedChanges` flags:

```ts
type EntryState =
  | { _tag: 'Draft' }
  | { _tag: 'Scheduled'; publishAt: DateTime.Utc }
  | { _tag: 'Published'; publishedAt: DateTime.Utc; sha: string; changes: 'none' | 'pending'; unpublishAt?: DateTime.Utc }
  | { _tag: 'Trashed'; deletedAt: DateTime.Utc; lastSha: string | null };
```

**Bounds:** sync takes at most 200 files per run; GitHub calls retry with an
exponential `Schedule` of at most 3 attempts within 10 seconds; the tick keeps
its per-run batch limits; request bodies are capped at 1 MB for entries and
25 MB for media.

## Server (Nitro)

`@venda/server` is a Nitro app used only for hosting, and Nitro supplies the
platform: presets choose the runtime (`cloudflare_module` by default; `node` is
built and tested too), storage mounts and server assets give file access, and
the `close` hook releases resources. There is no per-platform server code
beyond one module per preset family behind the `#venda/target` alias, which
names the SQL client for the Drizzle index (D1 or node:sqlite) and where
content comes from:

- **Workers:** the content folder is bundled as server assets at build time
  (until the GitHub store), so it is read-only.
- **Node:** `content/` and `.data/venda.sqlite` live in the working
  directory, Nitro's convention; the folder is watched through its storage
  mount (Nitro's fs driver uses chokidar).

On first use the app applies pending drizzle-kit migrations (each one atomic:
a transaction on SQLite, a batch on D1, which has no transactions), syncs the
content into the index, then serves the contract. Recurring work will use
Nitro's `scheduledTasks` (a Cron Trigger on Workers, croner elsewhere) when a
slice needs it.

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
  content: { github: { repo: 'saftapologetics/website', branch: 'main', dir: 'content' } },
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
- The plugin API stays marked unstable until the default preset has been built
  entirely through it. Venda's live suites run against the default preset plus
  one test plugin installed from outside the repository.

In detail:

- **Editor:** the screen for a collection kind. `posts` and `pages` default to
  the writer, `single` and `records` to the form editor; a collection may name
  another with `editor:`.
- **Block:** a framework-free spec (`defineBlock`: name, which is also its MDX
  tag; attribute Schema; whether it holds inline text, blocks or nothing; an
  HTML renderer) plus an admin part (TipTap node, Vue node view, its entry in
  the `/` and `+` menus and in "Turn into"). Markdown-native blocks such as
  headings and lists are blocks too, so the writer has no hard-coded list.
- **Field:** the input (and list cell) for a field type. `VendaDateTimeInput`
  becomes the `datetime` field.

On sites, `renderHtml` uses each block's HTML renderer, and framework
renderers such as `<VendaContent :components>` can replace any block with a
site component. An unknown block renders its text content, never raw markup.

## Quality gate

`pnpm check` runs, and must pass with zero warnings:

1. Formatting.
2. Oxlint with the vendored anti-slop rules and `max-lines-per-function: 70`
   for TypeScript packages; Nuxt ESLint stays for the Vue apps.
3. Type checking (strict, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`).
4. Effect Language Service diagnostics.
5. Vitest, including contract tests for each adapter.
6. Fallow audit, including package boundaries.

`pnpm e2e` builds and runs the real server on two presets (Workers on local
workerd, and Node), and drives the admin and site once they talk to it; it is
required before every commit that changes behaviour.

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
line. ESLint enforces the mechanical part
(`@stylistic/padding-line-between-statements`, `padded-blocks`,
`no-multiple-empty-lines` in `eslint.config.shared.mjs`); grouping by phase is
checked in review.

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
   and API tokens, built on Effect with their own suites.
3. **Write path.** Working copies, publish to files, conflicts.
4. **GitHub content store.** App authentication, commits, webhook sync; a
   contract test against a real throwaway repository.
5. **Lifecycle on files.** Scheduling, unpublish, trash and restore, revisions
   from git, preview, search.
6. **Admin shell, plugin API and default preset.** The shell and plugin host;
   every first-party screen built as a plugin: the writer editor (promoting
   the Focus prototype and deleting `app/prototypes`), the form editor, views,
   pages, settings, core blocks and fields, and the model editor writing
   `config.ts`; one external test plugin.
7. **CLI and deployment.** `init` against a repository, `sync`, `types` from
   `config.ts`, `deploy`; the hosted deployment moves to `@venda/server`.

Roadmap steps 5 to 12 then continue on this base.

## Content from elsewhere

- The hosted instance's blog posts are written as files once and committed.
- SAFT's Sanity migration script writes files directly.

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
| `@effect/sql-d1`, `@effect/sql-sqlite-node` | 4.0.1 | server | The SQL clients behind Drizzle's Effect drivers |
| `chokidar` | 5.0.0 | server | Required by Nitro's fs storage driver to watch the content folder |

Development: `oxlint` and `@oxlint/plugins` 1.86.0, `fallow` 3.31.0,
`@effect/language-service` 0.87.3, `drizzle-kit` 1.0.0-rc.5-5935859.

## Risks

- **Nitro 3 is in beta** (chosen over the stable `nitropack` 2.13.4 line).
  Venda pins the exact beta and only `@venda/server` depends on Nitro, so a
  regression stays in one package.
- **Drizzle's Effect drivers are pre-1.0**, pinned to a commit snapshot.
  They sit behind the `IndexDb` service; the core's tests run on the real
  node:sqlite driver and the live suites on D1. Its type declarations still
  import a beta Effect path (`effect/unstable/sql`) that resolves to nothing,
  which weakens the `SqlError` types it exposes until the next release.
- **GitHub availability and limits.** An outage blocks publishing, not saving.
  Installation tokens allow 5,000 requests an hour; sync batches its reads.
- **Markdown fidelity.** Some editor states have no Markdown form (for example
  overlapping marks); conversion normalises them, and round-trip tests define
  what is kept.
- **Worker size.** Effect, the Markdown stack and the core must fit the
  1 MB budget; slice 0 measured 254 kB gzipped before the Markdown stack.
