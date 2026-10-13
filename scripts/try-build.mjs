// Build inactive slots first; install only after every requested build passes.
// A failing build cannot truncate the files the current Worker or CLI uses.
import { join } from 'node:path';

export function tryBuilder(state, step, install) {
  let adminSlot = -1;
  let workerSlot = -1;
  let cliSlot = -1;

  return async kinds => {
    const admin = kinds.has('admin');
    const server = admin || kinds.has('server');
    const cli = kinds.has('cli');
    const nextAdmin = admin ? (adminSlot + 1) % 2 : adminSlot;
    const nextWorker = server ? (workerSlot + 1) % 2 : workerSlot;
    const nextCli = cli ? (cliSlot + 1) % 2 : cliSlot;
    const adminDir = join(state, 'admin', String(nextAdmin));
    const workerDir = join(state, 'build', String(nextWorker));
    const cliDir = join(state, 'cli-build', String(nextCli));

    if (admin)
      await step(
        'build admin',
        'pnpm',
        ['--filter', '@venda/admin-app', 'build'],
        {
          VENDA_ADMIN_BUILD_DIR: join(state, 'nuxt'),
          VENDA_ADMIN_OUTPUT_DIR: adminDir,
          VENDA_TRY_RELOAD: 'http://localhost:8794/__try/reload.js'
        }
      );

    if (server)
      await step('build the Worker', 'pnpm', ['exec', 'nitro', 'build'], {
        VENDA_ADMIN_OUTPUT_DIR: adminDir,
        VENDA_OUTPUT_DIR: workerDir
      });

    if (cli)
      await step('build the CLI', 'pnpm', ['--filter', '@venda/cli', 'build'], {
        VENDA_CLI_OUTPUT_DIR: cliDir
      });

    await install({ server, cli, workerDir, cliDir });
    adminSlot = nextAdmin;
    workerSlot = nextWorker;
    cliSlot = nextCli;
  };
}
