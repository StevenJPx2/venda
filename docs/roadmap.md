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

The authoritative architecture is [architecture.md](architecture.md) (approved
2026-10-05): content and models as files in git, a live SQL index, Effect in
the core, a Nitro 3 host, and an admin whose features are plugins. Venda is
greenfield: nothing is kept for compatibility, and features from the first
generation return only as their slices build them. Decisions that carry over:
Venda runs headless or embedded in a site's server; framework packages stay
thin; rich text travels as a JSON document; every operation passes one
capability check.

## Feature inventory

Status: `[ ]` not started · `[~]` partial · `[x]` done.

### 1. Core and runtime
- [x] Server on Cloudflare Workers, run locally on workerd with hot reload of content edits (a Node target existed until slice 2b and was dropped)
- [~] Databases: D1 done; Durable Object SQLite through Drizzle's driver to do
- [ ] Storage and cache through Nitro storage mounts (R2, KV, filesystem, S3-compatible, Redis)
- [x] Versioned migrations from drizzle-kit, applied atomically at startup on every database
- [ ] Object cache with invalidation on writes (menus, settings, taxonomies too)
- [ ] Secrets and key management guidance and rotation
- [ ] Schema evolution on deployed sites without data loss

### 2. Content model
- [x] Collections as folders with a `config.ts` model, read as data; entries as Markdown files
- [ ] Collections and models edited in the admin (writing `config.ts`)
- [x] Field types in models: text, textarea, rich text, number, boolean, date, datetime, tags, image, URL, select, relation, JSON
- [ ] More field types: slug, email, URL, color, multi-select, file, repeater/list, group, blocks
- [ ] Relations/references between collections (e.g. post → author), both directions
- [x] Singletons (single-entry collections such as a home page): the `single` kind opens straight into its one entry, created and edited in the admin
- [ ] Internationalization: locales, translated entries, translated taxonomies
- [ ] TypeScript type generation from the live schema (CLI)

### 3. Content lifecycle
- [x] Draft / published status (`draft: true` in the file; future `publishedAt` stays hidden)
- [x] Draft edits that leave the live version untouched until published (working copy + published file)
- [ ] Revisions with field comparison and restore (git history plus saves between publishes)
- [ ] Scheduled publishing and unpublishing (Nitro scheduled tasks)
- [ ] Preview links for unpublished content, opened on the site
- [ ] Trash / soft delete, restore, purge after 30 days
- [ ] Search across collections
- [ ] Bylines / multiple authors per entry (built on relations, step 5)
- [ ] Comments with moderation

### 4. Site structure
- [ ] Taxonomies (flat tags, hierarchical categories, custom taxonomies)
- [ ] Navigation menus (nested, linking entries, terms or URLs)
- [ ] Widget areas and widgets
- [ ] Sections (reusable content blocks)
- [ ] Page layouts and a block library for page building
- [~] Site settings (title, logo, social links, custom settings): name, address and admin copy in `content/site.ts`, edited in Settings → General
- [ ] Redirects manager
- [ ] SEO: per-entry meta, Open Graph, canonical URLs, sitemap.xml, robots.txt
- [ ] Dark-mode and theming hooks for frontends

### 5. Media library
- [ ] Uploads to object storage with size limits
- [ ] Media library screen with search, folders and bulk actions
- [ ] Direct uploads via signed URLs; replace file in place
- [ ] Image transformations (resize, format, quality) and responsive renderers
- [ ] Alt text, captions, focal point
- [ ] Usage tracking (where each file is referenced)
- [ ] External media providers

### 6. Users and authentication
- [x] Server-side sessions, revoked on password, role or status changes
- [x] Multiple users and invitations
- [x] Roles: Administrator, Editor, Author, Contributor, enforced as capability proofs, including per-entry ownership for editing and publishing
- [ ] Passkeys (WebAuthn) as the primary login
- [ ] OAuth sign-in (Google first, then GitHub and others)
- [ ] Magic-link email sign-in and pluggable email providers
- [~] API tokens for scripts and CI (acting as their person; scopes to do)
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
- [ ] Sandboxed execution (Worker isolates)
- [ ] Plugin CLI: scaffold, test, bundle, publish
- [ ] Plugin registry and installation from the admin

### 9. Import, export and themes
- [ ] WordPress import (WXR files, REST API) including media and taxonomies
- [ ] Generic content import (JSON/CSV) and the Sanity migration script as a template
- [ ] Backups and restore (database + media)
- [ ] Site transfer between installs
- [ ] Seed files and starter themes/templates

### 10. Admin experience
- [x] Ghost-style writing canvas and schema-driven forms, as editor plugins
- [ ] Screens for every feature above
- [ ] Inline visual editing from the live site
- [ ] Admin UI translations
- [ ] Dark mode

### 11. Optional integrations (last)
- [ ] Decentralised identity login (AT Protocol)
- [ ] Paid content via x402 payments

## Release requirements

- `@venda/richtext` and `@venda/contract` export TypeScript source for workspace use; they must ship compiled JavaScript before `@venda/nuxt` (which imports both) is published to npm.

## Build order

Everything ships together, but work proceeds in dependency order:

The admin shell and plugin host came forward into slice 2b, carrying working
UI for the read path and accounts. Every slice after that ships its API, its
admin screens as plugins and its testable HTML together, for a tighter working
loop. Slice 6 finishes and freezes the plugin API.

1. Server, file format and read path (architecture slices 0 and 1). **Done.**
2. Users, roles, sessions, API tokens, because every later feature records who did what (slice 2). **Done.**
3. Structured rich text editing and the write path (slice 3). **Done.**
4. The D1 content store with every revision kept, and the agent CLI (pull, push, history, restore); then the content lifecycle: drafts vs live, scheduling, preview, trash, search (slices 4 and 5); then freeze the plugin API and finish the CLI (slices 6 and 7).
5. Content model: new field types, relations, singletons, i18n, typegen.
6. Media library.
7. Site structure: taxonomies, menus, widgets, sections, settings, redirects, SEO.
8. Framework adapters and renderers (Astro, Next.js, SvelteKit, Hono).
9. MCP server, CLI, webhooks, agent skills.
10. Plugins and sandbox.
11. Import/export, backups, themes.
12. Passkeys/OAuth/magic links polish, audit log, optional integrations.
