# Venda

![Signing in to the admin, finding a Journal post, editing its title and publishing it, then running venda history on the same file](docs/media/admin.gif)

Venda is a CMS that runs on Cloudflare Workers.

It is in early development.

- Your content is files: a folder per collection, a `config.ts` for its fields, and a Markdown file per entry.
- The files are stored in D1, and every version of every file is kept.
- Editors use the admin. Developers, scripts and agents use the `venda` command.
- A change made from an old copy of a file is refused, so nobody's work is written over.
- The design is in [docs/architecture.md](docs/architecture.md). Venda is built slice by slice on `main`.

## Try it

- Run `pnpm try`, then open `http://localhost:8794`.
- Open the admin and sign in as `owner@venda.local` / `try-venda-owner` (local only).
- In the admin you can:
  - write and publish entries
  - browse content and file problems
  - invite people and manage them
  - change your password
  - create or revoke API tokens
- Each slice has its own page of checks you can run.
- Each screen is a plugin, loaded when you open it. Permissions are checked by the API, not the screen.

While it runs:

- Changes to the admin, Worker or CLI rebuild what depends on them.
- The Worker restarts after a successful build. A failed build keeps the last working version running; save again to retry.
- Open admin and try pages reload when the new version is ready. If you entered text, they ask before reloading.
- Type `r` and press Enter to rebuild everything without losing data.
- It opens two Cloudflare quick tunnels: public `trycloudflare.com` addresses for the admin and the try pages, printed when it starts. Hot reload works only on `localhost`.
  - Only the addresses allowed can open them, by a one-time PIN emailed to that address. That is your `git config user.email`, or a comma-separated list in `VENDA_TRY_TUNNEL_EMAILS`. Without an address, no tunnel opens.
  - Needs `cloudflared` (`brew install cloudflared`). Pass `--no-tunnel` to skip the tunnels.
- Changes to `try/content` are imported only into an empty database. They do not overwrite content you edited in D1.

Between runs:

- `pnpm try` keeps the local database (`.try/data`): your content and its versions, the people and tokens you made, and your session.
- It rebuilds everything else: the build and the logs.
- An empty database gets `try/content` imported into it.
- `pnpm try --fresh` wipes the database too, so `try/content` is imported again.

`pnpm e2e admin` runs the same admin in a browser. It covers an invited author in a private window, 390px screens and a collection of a thousand entries.

## The venda CLI

For developers, scripts and agents. You need an API token (Account → API tokens).

```sh
pnpm venda login --url https://cms.example.com --token YOUR_API_TOKEN
pnpm venda pull ./content                  # the site's files, and the SHA each was pulled at
pnpm venda status ./content                # what you changed since the pull
pnpm venda push ./content -m "Retitle"     # all of your changes in one write, or none
pnpm venda history journal/first-light.md  # recent versions; then `show --at` or `restore --to`
pnpm venda site set name="Hill Notes"
pnpm venda entry set journal autumn --set title=Autumn --markdown body=autumn.md
```

If a file changed on the site since your pull, the push is refused and nothing is written. To settle it:

1. Run `pnpm venda pull ./content`. It brings in the other changes and keeps yours.
2. Merge the file. `pnpm venda show <path>` prints the site's version.
3. Run `pnpm venda resolve <path> ./content`.
4. Run `pnpm venda push ./content`.

You can also set `VENDA_URL` and `VENDA_TOKEN` instead of saving a login.

Every command prints JSON with `--json`, and exits non-zero when it fails.

## Content files

The files keep this layout in D1, and when they are imported or exported:

```
content/
  blog/
    config.ts        export default defineCollection({ name: 'Blog', kind: 'posts', fields: { … } })
    hello-world.md   YAML frontmatter for the fields, Markdown for the body
```

- Entries are Markdown (GFM) with block tags such as `<Callout tone="info">`. Tag attributes must be plain data.
- Writes that do not fit the model are refused. Import keeps unreadable files, lists them as problems with their line, and never serves them.
- Drafts (`draft: true`) and entries dated in the future are not served either.

## API

Public:

- `GET /api/health`
- `GET /api/site`: the site's name, address and screen descriptions.
- `GET /api/content/:collection`: published entries, newest first.
- `GET /api/content/:collection/:slug`: one published entry.
- `GET /api/join/:token` and `POST /api/join/:token` (`{ name, password }`): see and accept an invitation.
- `POST /api/auth/sign-in` (`{ email, password }`): sets the `venda_session` cookie.

Signed in, with the session cookie or `Authorization: Bearer <API token>`:

- `GET /api/auth/me`, `POST /api/auth/sign-out`, and `POST /api/auth/password` (`{ current, next }`; ends your other sessions).
- `GET /api/users` and `PATCH /api/users/:id` (`{ role?, status?, name? }`): administrators only.
- `GET /api/invitations`, `POST /api/invitations` (`{ email, role }`) and `DELETE /api/invitations/:id`: administrators only.
- `GET /api/tokens`, `POST /api/tokens` (`{ name }`) and `DELETE /api/tokens/:id`: your own tokens.
  - The secret is shown once, when the token is made.
  - Making a token needs a signed-in session, not a token.
- `GET /api/admin/collections`, `GET /api/admin/collections/:collection/entries` (paged; `?q=` searches) and `GET /api/admin/collections/:collection/entries/:slug`: what the admin shows.
  - Administrators and editors also see drafts and future-dated entries.
  - Authors and contributors see published entries only.
- `GET /api/admin/content-problems`: files that do not fit their model, with their line. Administrators only.
- `POST /api/admin/collections/:collection/entries/:slug/unpublish` and `/republish` (`{ revision, sha }`): take an entry off the site as a draft, or put a clean draft back.
- `POST …/trash` (`{ revision, sha }`) removes the entry's file. Its saved edits and owner are kept, and its slug stays reserved.
- `POST …/restore` (`{ revision }`) brings a trashed entry back as a draft. `GET /api/admin/trash` lists trashed entries, paged.
  - These need permission to publish the entry: administrators, editors, or the author it is assigned to.
  - Each refuses a stale copy revision (`EditedElsewhere`) or file SHA (`Conflict`), and changes nothing.

The content files, for administrators and editors:

- `GET /api/admin/files`: every file's path, SHA and size.
- `GET /api/admin/files/read?path=`: one file's text.
- `GET /api/admin/files/revisions?path=`: a file's versions, newest first. Add `&before=<id>` for older ones.
- `GET /api/admin/files/revision?path=&sha=`: one version's text.
- `POST /api/admin/files` (`{ message, changes: [{ path, text | null, baseSha | null }] }`): writes up to 200 files at once.
  - Each file is written from the SHA it was read at.
  - All of the files are written, or none. `Conflict` names the first file that moved.
- `POST /api/admin/import` (`{ files: [{ path, text }] }`): brings up to 200 files in, over whatever is there. Files the site cannot read are kept and listed as problems. Administrators only.

Answers:

- An entry comes back as `{ collection, slug, publishedAt, data }`. The rich-text field is a document.
- Errors are tagged JSON (`{ "_tag": "CollectionNotFound", ... }`), with one status code each.
- Roles are administrator, editor, author and contributor.
  - Only administrators manage people and invitations.
  - Authors can edit and publish entries assigned to them.
  - Contributors can save their own entries but not publish them.

## Configuration

- `VENDA_OWNER_EMAIL` and `VENDA_OWNER_PASSWORD` (required; the password needs at least 12 characters): the recovery owner.
  - The owner always signs in as an active administrator.
  - To recover access, change the password.
- `VENDA_VERSION` (optional): reported by `/api/health`.
- Workers bindings:
  - `VENDA_DB` (D1): content, its index and people.
  - `VENDA_KV` (KV): sessions.

## Repository

- `packages/content` (**`@venda/content`**): the file format.
  - Reads `config.ts` models as data and never runs them.
  - Converts frontmatter and Markdown with block tags to and from rich-text documents.
- `packages/contract` (**`@venda/contract`**): the HTTP API in Effect Schema (`HttpApi`), shared by the server and every client.
- `packages/core` (**`@venda/core`**): the domain in Effect.
  - The content files, their versions and index, working copies and the public reads (`/content`).
  - Accounts (`/auth`).
  - One Drizzle database (`/database`). Migrations live in `packages/core/drizzle`; make them with `pnpm --filter @venda/core db:generate`.
  - Permission checks are compile-time proofs ([gdp-ts](https://github.com/rauchg/gdp-ts)), made only in `src/auth/proofs/`. `test/mistakes.ts` lists code that must not compile.
- `packages/server` (**`@venda/server`**): the Nitro 3 host.
  - `pnpm --filter @venda/server build` builds the Cloudflare Worker, with D1 for content and everything else, and KV for sessions.
  - Locally it runs on workerd through `wrangler dev`, with local D1.
  - Migrations run at startup.
- `packages/cli` (**`@venda/cli`**): the `venda` command. `pnpm venda --help` builds and runs it.
- `packages/richtext` (**`@venda/richtext`**): the rich-text document format: validation, a safe HTML renderer and plain-text helpers.
- `packages/nuxt` (**`@venda/nuxt`**): a Nuxt module any Nuxt 4 site can install to read Venda content (`useVendaCollection`, `useVendaEntry`, `<VendaContent>`). See [its README](packages/nuxt/README.md).
- `packages/admin` (**`@venda/admin`**): the browser SDK, the plugin contract (not final yet) and a typed client built from `VendaApi`.
- `packages/views-core`: the content screens: collections, entries and their editing, content problems, and Settings → General.
- `packages/pages-core`: the account screens: people, invitations, tokens, your account, and joining.
- `packages/editor-writer`: the Writer, the editor for posts.
- `packages/editor-form`: the form editor for every other kind of entry.
- `packages/fields-core`: one input per field type.
- `packages/editor-kit`: the parts both rich-text editors share.
- `packages/preset-default`: puts the first-party plugins together.
- `apps/admin` (**`@venda/admin-app`**): a static Nuxt 4.6 shell. The Worker serves it at `/admin/`, on the API's own origin.
- `apps/landing`: the Venda website, a Nuxt UI site built on `@venda/nuxt`.

The screen packages depend on the SDK, never on each other.

## Checks

```sh
pnpm format     # Prettier: formats every source file
pnpm lint       # Prettier check, ESLint in every package, then Oxlint (warnings denied)
pnpm typecheck  # tsc, plus Effect diagnostics in the Effect packages
pnpm test
pnpm build
pnpm fallow     # dead code, complexity and duplication in the gated packages
pnpm check      # lint + typecheck + test + fallow in one go
pnpm e2e        # live suites: the Worker built and run on local workerd and D1, with test content imported
pnpm try        # start it and open http://localhost:8794 to try each slice by hand (--fresh: wipe its data)
```

- `pnpm lint:fix` formats and fixes what it can in one pass.
- Prettier formats everything (`.prettierrc.json`, 80 columns). Markdown, content fixtures and generated files keep their own shape (`.prettierignore`).
- ESLint (flat config) handles code rules and blank lines. `eslint-config-prettier` stops it from disagreeing with Prettier.
  - Shared rules live in `eslint.config.shared.mjs`.
  - The Nuxt apps extend `@nuxt/eslint`'s `withNuxt()`. The other packages use `typescript-eslint`.
- Packages listed in `tools/new-architecture.json` also get Oxlint's vendored anti-slop and Effect rules, and the Fallow gate.
