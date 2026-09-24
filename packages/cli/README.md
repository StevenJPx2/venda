# Venda CLI

Install Venda on your Cloudflare account with `npx venda@latest init <directory>` after the CLI's npm release. The CLI provisions D1, KV and R2, packages the admin SPA and API into one Worker, applies database migrations, and generates an admin password.

Until then, build from the repository checkout with `pnpm install && pnpm --filter venda build`, then run `node packages/cli/dist/cli.js init <directory>`.

Requires Node.js 20.12 or newer and Wrangler authentication (`npx wrangler login`). Run `npx venda --help` for the full command list.

From an initialized install directory:

- `npx venda status` shows the URL, deployed version and resource IDs.
- `npx venda doctor` checks account access, resource bindings, migrations and health.
- `npx venda update` deploys the release bundled with that CLI version.
- `npx venda admin password --sign-out-everyone` rotates the password and invalidates current sessions.
- `npx venda backup` exports the D1 database to SQL (R2 media is separate).
- `npx venda logs` streams Worker logs.
- `npx venda uninstall --yes [--keep-data]` removes the Worker and, unless requested otherwise, its Cloudflare resources.

The install's `venda.json` is its configuration source of truth. The CLI regenerates `wrangler.jsonc` from it on deploy and copies release files into `.venda/versions/<version>`.
