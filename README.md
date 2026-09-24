# Venda

Venda is a small, Cloudflare-native headless CMS. The admin and landing site are Nuxt 4/Nitro apps built with Nuxt UI; the content API is a separate Cloudflare Worker backed by D1, R2, and KV.

## Repository

- `apps/admin` — Nuxt UI admin dashboard, deployed with Nitro's `cloudflare_module` preset.
- `apps/landing` — Nuxt UI marketing site, same preset.
- `apps/api` — Worker API with cookie sessions, D1 repositories, R2 uploads, and KV cache invalidation.
- `apps/api/migrations` — numbered D1 migrations for collections, entries, and media.
- `apps/api/scripts/seed.mjs` — idempotent sample-data seeder (`VENDA_ADMIN_PASSWORD=… pnpm --filter @venda/api db:seed`; add `-- --update` to overwrite existing seed entries).

- `packages/schema` — **`@venda/schema`**, the content model: field definitions, schema parsing and entry validation, shared by the API and the admin so both enforce the same rules.
- `packages/nuxt` — **`@venda/nuxt`**, a Nuxt module any Nuxt 4 site can install to read Venda content (`useVendaCollection`, `useVendaEntry`, `<VendaContent>`). See [its README](packages/nuxt/README.md).
- `packages/cli` — **`venda`**, a self-hosting CLI that provisions D1, KV, R2 and deploys an admin/API single-Worker install into your Cloudflare account.

## Content model (Directus-style)

Each collection defines typed **fields**. A field has a `key`, an **interface** that decides how it is edited and what it stores, and optional `label`, `note`, `placeholder`, `required`, `width: 'half'` and (for dropdowns) `choices`.

| Interface | Stores | Edited with |
| --- | --- | --- |
| `input`, `textarea` | text | text input / textarea |
| `wysiwyg` | HTML | rich-text editor |
| `number` | number | number input |
| `toggle` | boolean | switch |
| `datetime` | ISO 8601 string | date & time picker |
| `dropdown` | one of `choices` | select |
| `tags` | string[] | tag input |
| `image` | http(s) URL | upload to R2 |
| `code` | any JSON | JSON editor |

A collection's `titleField` names its entries. Edit the model from **Data model** in the admin, or `PATCH /api/collections/:id` with `{ schema }`. Entries are validated against it on every write: **types are always checked, `required` only on publish**, so drafts can be saved while incomplete. Keys the schema doesn't define are preserved, never dropped. Collections created before field definitions existed (a loose `{ key: type }` map) are upgraded automatically on read.

## Editor (Ghost-style)

Entries open in a full-screen editor. The title field is the big title, and the collection's first `wysiwyg` field is the writing canvas:

- formatting appears in a bubble toolbar when you select text; **Cmd+K** adds a link
- `+` beside an empty line, or typing `/`, inserts cards: headings, lists, image (uploaded to R2), quote, code, divider
- Markdown shortcuts work as you type (`## `, `- `, `> `, ``` ``` ```, `---`, `**bold**`)
- **drafts autosave**; published entries show *Unsaved changes* until you press **Update** (or **Cmd+S**)
- the URL slug follows the title until you edit it or publish
- every other field is in the settings panel as a generated form

Collections without a rich-text field (e.g. Products) get the title plus the generated form instead.

The landing site is itself a Venda consumer, built on `@venda/nuxt`: its hero (`pages/home`), feature cards (`features`), workflow steps (`steps`) and `/blog` pages are fetched from the public content API at request time, so editing those entries in the admin changes the live site.

The frontends use Nuxt UI 4 (Tailwind CSS v4 + Reka UI). The admin is a `UDashboardGroup` layout with `UAuthForm` login, `UForm`/`UFormField` editors, `UFileUpload` for R2 media, and toasts via `UApp`.

## Quick start

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm db:migrate:local
pnpm dev
```

The API runs on `http://localhost:8787` and the admin on `http://localhost:3000`. The local default credentials are `admin@example.com` / `change-me`.

## Cloudflare setup

Create a D1 database, KV namespace, and R2 bucket, then put their IDs/names in `apps/api/wrangler.jsonc`. Set the production secret with `wrangler secret put ADMIN_PASSWORD` and deploy:

```sh
pnpm db:migrate:remote
pnpm --filter @venda/api run deploy
pnpm --filter @venda/admin run deploy
pnpm --filter @venda/landing run deploy
```

The live deployment runs at `venda.stevenjohn.co` (landing), `app.venda.stevenjohn.co` (admin), and `api.venda.stevenjohn.co` (API), each a Worker custom domain.

For production, put the admin behind Cloudflare Access (recommended) and set `NUXT_PUBLIC_API_BASE` to the API Worker URL. The Worker still enforces its own signed, KV-backed admin session.

## Self-host Venda

Venda can be installed into your own Cloudflare account with the CLI. It creates a D1 database, KV namespace and R2 bucket, then deploys the admin SPA and API together on one Worker. The CLI bundles its Worker, admin assets and database migrations; your project directory only needs its install config and generated Wrangler config.

Requirements: Node.js 20.12 or newer and a Cloudflare account. Sign in with Wrangler, then run:

```sh
npx venda@latest init my-venda
```

The `venda` npm package is prepared in `packages/cli` but has not been published yet. Until its first npm release, build and run it from this checkout:

```sh
pnpm install
pnpm --filter venda build
node packages/cli/dist/cli.js init my-venda
```

The interactive setup selects your account and asks for the install name, admin email, optional custom domain, and whether to add a welcome post. For CI or scripted installs, provide every required option and disable prompts:

```sh
npx venda@latest init my-venda \
  --no-prompt --account <account-id> --name my-venda \
  --email you@example.com --no-sample
```

The generated password is displayed once. Store it securely. From the install directory, maintain the Worker with:

```sh
npx venda status
npx venda doctor
npx venda update
npx venda admin password --sign-out-everyone
npx venda backup
npx venda logs
```

`venda backup` exports D1 content and metadata to SQL; R2 media files are stored separately. `venda uninstall --yes` removes the Worker and Cloudflare resources. Use `--keep-data` to remove only the Worker and preserve D1, KV and R2. The generated `venda.json` and versioned `.venda/` files remain locally for recovery or redeployment.

The self-hosted install serves the admin and API from the same origin, uses a relative `/api` base, and routes API requests through the Worker while static assets serve the Nuxt SPA. The existing hosted admin/API/landing deployment remains a separate topology.

## API

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/collections`, `PATCH /api/collections/:id` (name and data model)
- `GET/POST /api/collections/:id/entries`, `GET/PATCH/DELETE /api/entries/:id`
- `POST /api/media`, `GET /api/media/:key`
- `GET /api/content/:collection` and `GET /api/content/:collection/:slug` are public delivery endpoints (published entries only).

Invalid schemas are rejected with `400`; entries that break their collection's schema get `422` with a `fields` array naming each problem. Entry `data` is stored as JSON, so changing the data model never needs a database migration.

## Checks

```sh
pnpm lint       # ESLint flat config across all packages
pnpm typecheck
pnpm test
pnpm build
pnpm check      # lint + typecheck + test in one go
```

Linting uses ESLint flat config. Shared rules live in `eslint.config.shared.mjs`; the Nuxt apps extend their project-aware config via `@nuxt/eslint`'s `withNuxt()`, and the API Worker uses `typescript-eslint`. Run `pnpm lint:fix` to auto-fix.

## Current platform notes

The scaffold follows current Nuxt 4/Nitro deployment guidance (`cloudflare_module`) and Wrangler JSONC resource bindings. Workers AI is intentionally optional and can be added behind a future binding without changing the content model.
