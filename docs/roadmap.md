# Venda platform roadmap

Goal: grow Venda into a framework-agnostic, full-featured CMS with feature
parity with EmDash (https://emdashcms.com), while keeping Venda's own
architecture, Vue admin and headless API.

**Clean-room rule.** EmDash is a feature reference only. Features are taken from
its public documentation and product pages, never from its source code. Do not
copy, translate or paraphrase EmDash code into this repository.

Work happens on the `platform` branch and merges to `main` when the whole
feature set is complete. SAFT stays on Sanity until that merge.

## Architecture decisions

These are expensive to reverse, so they are settled before feature work.

1. **Framework-neutral core.** `@venda/core` is built only on Web standards
   (`Request`, `Response`, `URL`, Web Crypto, streams); every host calls it the
   same way:

   ```ts
   const venda = createVenda({ db: d1(env.VENDA_DB), storage: r2(env.VENDA_MEDIA), kv: kv(env.VENDA_CACHE) });
   return venda.fetch(request); // → Response
   ```
2. **Pluggable runtime services.** The core talks to interfaces, never to
   Cloudflare bindings directly:
   - `Database` (SQL): D1, SQLite (Node), libSQL/Turso, PostgreSQL.
   - `ObjectStore` (media): R2, S3-compatible, local filesystem.
   - `KeyValue` (cache, sessions): KV, in-memory, Redis.
   - `Scheduler` (scheduled publishing, plugin cron): Cron Triggers, Node timer.
   - `Mailer` (magic links, invitations): pluggable provider.
3. **Two deployment modes.**
   - *Headless*: Venda runs as its own Worker or Node server; any site reads it
     through the REST API or `@venda/client`.
   - *Embedded*: a framework adapter mounts the core inside the site's own
     server (like EmDash's Astro integration), sharing one deployment.
4. **Framework packages are thin.** `@venda/client` (framework-free typed
   client and query helpers) plus adapters for Nuxt, Astro, Next.js, SvelteKit
   and Hono. Each adapter mounts the handler, serves the admin, and ships
   rich-text and image renderers for its UI library.
5. **Structured rich text.** Rich-text fields are stored as a versioned JSON
   node tree (ProseMirror/TipTap), so every framework renders it natively and
   content can go to email, apps or agents. HTML content is converted by a core
   migration, and an HTML renderer is available for simple sites.
6. **Real schema, typed output.** Collections keep a schema document; the CLI
   generates TypeScript types from the live schema for every adapter.
7. **One admin.** The Vue/Nuxt UI admin is a static SPA served by any runtime.
8. **Permissions everywhere.** Every operation (REST, MCP, CLI, plugins) goes
   through one capability check tied to a user role or an API-token scope.

## Feature inventory

Status: `[ ]` not started · `[~]` partial · `[x]` done.

### 1. Core and runtime
- [x] Framework-neutral request handler (`@venda/core`)
- [~] Database adapters: D1 and SQLite done; libSQL/Turso, PostgreSQL to do
- [~] Storage adapters: R2 and local filesystem done; S3-compatible to do
- [~] Cache/session adapters: KV and memory done; Redis to do
- [ ] Versioned core migrations runnable on every database
- [ ] Node.js server deployment (in addition to Cloudflare)
- [ ] Object cache with invalidation on writes (menus, settings, taxonomies too)
- [ ] Secrets and key management guidance and rotation
- [ ] Schema evolution on deployed sites without data loss

### 2. Content model
- [x] Collections defined in the admin with field schemas
- [~] Field types: text, textarea, rich text (structured document), number, toggle, date, dropdown, tags, image, JSON
- [ ] More field types: slug, email, URL, color, multi-select, file, repeater/list, group, blocks
- [ ] Relations/references between collections (e.g. post → author), both directions
- [ ] Singletons (single-entry collections such as a home page)
- [ ] Internationalization: locales, translated entries, translated taxonomies
- [ ] TypeScript type generation from the live schema (CLI)

### 3. Content lifecycle
- [x] Draft / published status
- [x] Draft edits that leave the live version untouched until published (working copy + published snapshot)
- [x] Revisions with field comparison and restore
- [x] Scheduled publishing and unpublishing (Cron Trigger / Node timer)
- [x] Preview links for unpublished content, opened on the site
- [x] Trash / soft delete, restore, purge after 30 days
- [x] Search across collections (indexed plain text; public search on published text)
- [ ] Bylines / multiple authors per entry (built on relations, step 5)
- [ ] Comments with moderation

### 4. Site structure
- [ ] Taxonomies (flat tags, hierarchical categories, custom taxonomies)
- [ ] Navigation menus (nested, linking entries, terms or URLs)
- [ ] Widget areas and widgets
- [ ] Sections (reusable content blocks)
- [ ] Page layouts and a block library for page building
- [ ] Site settings (title, logo, social links, custom settings)
- [ ] Redirects manager
- [ ] SEO: per-entry meta, Open Graph, canonical URLs, sitemap.xml, robots.txt
- [ ] Dark-mode and theming hooks for frontends

### 5. Media library
- [~] Uploads to object storage with size limits
- [ ] Media library screen with search, folders and bulk actions
- [ ] Direct uploads via signed URLs; replace file in place
- [ ] Image transformations (resize, format, quality) and responsive renderers
- [ ] Alt text, captions, focal point
- [ ] Usage tracking (where each file is referenced)
- [ ] External media providers

### 6. Users and authentication
- [x] Server-side sessions, revoked on password, role or status changes
- [x] Multiple users and invitations
- [x] Roles: Administrator, Editor, Author, Contributor, enforced as capabilities
- [ ] Passkeys (WebAuthn) as the primary login
- [ ] OAuth sign-in (Google first, then GitHub and others)
- [ ] Magic-link email sign-in and pluggable email providers
- [x] API tokens with scopes for scripts and CI
- [ ] Audit log

### 7. Agents and automation
- [ ] Built-in MCP server with OAuth and per-token scopes
- [ ] Content and schema CLI (create, edit, publish, schedule, search, import)
- [ ] Agent skills describing Venda's APIs for coding assistants
- [ ] Webhooks on content events (rebuild static sites on publish)

### 8. Plugins
- [ ] Plugin API: lifecycle hooks, API routes, storage, settings
- [ ] Admin extensions: pages, dashboard widgets, custom fields, custom blocks
- [ ] Capability manifest approved at install time
- [ ] Sandboxed execution (Worker isolates on Cloudflare, workerd process on Node)
- [ ] Plugin CLI: scaffold, test, bundle, publish
- [ ] Plugin registry and installation from the admin

### 9. Import, export and themes
- [ ] WordPress import (WXR files, REST API) including media and taxonomies
- [ ] Generic content import (JSON/CSV) and the Sanity migration script as a template
- [ ] Backups and restore (database + media)
- [ ] Site transfer between installs
- [ ] Seed files and starter themes/templates

### 10. Admin experience
- [x] Ghost-style writing canvas, schema-driven forms
- [ ] Screens for every feature above
- [ ] Inline visual editing from the live site
- [ ] Admin UI translations
- [ ] Dark mode

### 11. Optional integrations (last)
- [ ] Decentralised identity login (AT Protocol)
- [ ] Paid content via x402 payments

## Release requirements

- `@venda/richtext` and `@venda/schema` export TypeScript source for workspace use; they must ship compiled JavaScript before `@venda/nuxt` (which imports `@venda/richtext` at runtime) is published to npm.

## Build order

Everything ships together, but work proceeds in dependency order:

1. Core extraction and runtime interfaces (D1/R2/KV first, then Node/SQLite/S3). **D1/R2/KV and SQLite/filesystem/memory done.**
2. Users, roles, sessions, API tokens, because every later feature records who did what. **Done.**
3. Structured rich text and HTML migration. **Done.**
4. Content lifecycle: drafts vs live, revisions, scheduling, preview, trash, search. **Done.**
5. Content model: new field types, relations, singletons, i18n, typegen.
6. Media library.
7. Site structure: taxonomies, menus, widgets, sections, settings, redirects, SEO.
8. Framework adapters and renderers (Astro, Next.js, SvelteKit, Hono).
9. MCP server, CLI, webhooks, agent skills.
10. Plugins and sandbox.
11. Import/export, backups, themes.
12. Passkeys/OAuth/magic links polish, audit log, optional integrations.
