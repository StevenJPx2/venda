# Venda

Venda is a file-first, Cloudflare-native CMS. Content and data models live as files in your site's git repository: a folder per collection, a `config.ts` describing its fields, and a Markdown file per entry. A Venda server keeps a live index of those files and serves them through a typed content API. The design is in [docs/architecture.md](docs/architecture.md); it is being built slice by slice on the `platform` branch.

## Repository

- `packages/content`: **`@venda/content`**, the file format: `config.ts` collection models read as data (never run), frontmatter, and Markdown with block tags to and from rich-text documents.
- `packages/contract`: **`@venda/contract`**, the HTTP API in Effect Schema (`HttpApi`), shared by the server and every client.
- `packages/core`: **`@venda/core`**, the domain in Effect: content sync into the index (a Drizzle schema, migrations in `packages/core/drizzle` from `pnpm --filter @venda/core db:generate`) and the public reads.
- `packages/server`: **`@venda/server`**, the Nitro 3 host. `pnpm --filter @venda/server build` targets Cloudflare Workers (D1, content bundled from `VENDA_CONTENT_DIR`, default `./content`); `NITRO_PRESET=node` builds a Node server that keeps `content/` and `.data/venda.sqlite` in its working directory and watches the content folder. Migrations apply at startup.
- `packages/richtext`: **`@venda/richtext`**, the rich-text document format: validation, a safe HTML renderer and plain-text helpers.
- `packages/nuxt`: **`@venda/nuxt`**, a Nuxt module any Nuxt 4 site can install to read Venda content (`useVendaCollection`, `useVendaEntry`, `<VendaContent>`). See [its README](packages/nuxt/README.md).
- `apps/admin`: the admin, rebuilt as a plugin-built shell in slice 6; today it holds the Focus editor prototype (`/prototypes/editor`).
- `apps/landing`: the Venda website, a Nuxt UI site built on `@venda/nuxt`.

## Content on disk

```
content/
  blog/
    config.ts        export default defineCollection({ name: 'Blog', kind: 'posts', fields: { … } })
    hello-world.md   YAML frontmatter for the fields, Markdown for the body
```

Entries are Markdown with GFM and block tags such as `<Callout tone="info">`, whose attributes must be plain data. A file that does not fit its model is recorded as a problem, with its line, and never served; drafts (`draft: true`) and entries dated in the future are not served either.

## API

- `GET /api/health`
- `GET /api/content/:collection`: published entries, newest first.
- `GET /api/content/:collection/:slug`: one published entry.

Entries come back as `{ collection, slug, publishedAt, data }`, with the rich-text field as a document. Unknown collections and entries are typed 404s (`CollectionNotFound`, `EntryNotFound`).

## Checks

```sh
pnpm lint       # ESLint in every package, then Oxlint (warnings denied)
pnpm typecheck  # tsc, plus Effect diagnostics in the Effect packages
pnpm test
pnpm build
pnpm fallow     # dead code, complexity and duplication in the gated packages
pnpm check      # lint + typecheck + test + fallow in one go
pnpm e2e        # live suites: the server built and run on Workers (local workerd) and Node
pnpm try        # start both and open http://localhost:8794 to try each slice by hand
```

Linting uses ESLint flat config. Shared rules live in `eslint.config.shared.mjs`; the Nuxt apps extend `@nuxt/eslint`'s `withNuxt()`, and the other packages use `typescript-eslint`. Packages listed in `tools/new-architecture.json` also get Oxlint's vendored anti-slop and Effect rules and the Fallow gate. Run `pnpm lint:fix` to auto-fix.
