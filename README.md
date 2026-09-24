# Venda

Venda is a small, Cloudflare-native headless CMS. The admin and landing site are Nuxt 4/Nitro apps built with Nuxt UI; the content API is a separate Cloudflare Worker backed by D1, R2, and KV.

## Repository

- `apps/admin` — Nuxt UI admin dashboard, deployed with Nitro's `cloudflare_module` preset.
- `apps/landing` — Nuxt UI marketing site, same preset.
- `apps/api` — Worker API with cookie sessions, D1 repositories, R2 uploads, and KV cache invalidation.
- `apps/api/migrations` — numbered D1 migrations for collections, entries, and media.
- `apps/api/scripts/seed.mjs` — idempotent sample-data seeder (`pnpm --filter @venda/api db:seed`).

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

## API

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/collections`, `GET/PATCH/DELETE /api/collections/:id`
- `GET/POST /api/collections/:id/entries`, `GET/PATCH/DELETE /api/entries/:id`
- `POST /api/media`, `GET /api/media/:key`
- `GET /api/content/:collection` and `GET /api/content/:collection/:slug` are public delivery endpoints.

All admin mutations validate JSON at the boundary. Entry `data` is stored as JSON so a collection can evolve its schema without a second migration.

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
