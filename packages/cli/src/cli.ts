#!/usr/bin/env node
import { admin } from './commands/admin.js';
import { backup } from './commands/backup.js';
import { config } from './commands/config.js';
import { deploy, migrate } from './commands/deploy.js';
import { doctor } from './commands/doctor.js';
import { init } from './commands/init.js';
import { logs } from './commands/logs.js';
import { status } from './commands/status.js';
import { uninstall } from './commands/uninstall.js';
import { cliVersion } from './release.js';
import { parseFlags } from './flags.js';
import { p, UsageError } from './ui.js';

const HELP = `Venda — self-hosted CMS on Cloudflare

Usage: venda <command> [options]

Getting started:
  venda init [directory]       Provision and deploy a new install
  venda deploy                 Deploy the release bundled with this CLI
  venda update                 Upgrade the install to this CLI's release

Manage your install:
  venda status                 Show install URL, version and resources
  venda doctor                 Check Cloudflare access and install health
  venda admin password         Change the admin password
  venda backup                 Export the D1 database to SQL
  venda logs                   Tail live Worker logs
  venda migrate                Apply pending D1 migrations
  venda config get [key]       Read configuration
  venda config set <key> <v>   Change name, domain, admin-email or admin-origins
  venda uninstall              Remove the Worker and Cloudflare resources

Options:
  -d, --dir <path>             Install directory (defaults to current directory)
      --account <id|name>      Cloudflare account for init
      --name <name>            Worker and resource prefix for init
      --email <email>          Admin email for init
      --domain <host>          Custom hostname for init, e.g. cms.example.com
      --sample / --no-sample   Create or skip the welcome collection/post
      --no-prompt              Disable interactive prompts
  -y, --yes                    Confirm a destructive operation
      --keep-data              Uninstall the Worker but preserve D1, KV and R2
      --sign-out-everyone      Rotate sessions when changing the password
      --password <value>       Supply an admin password
  -o, --output <path>          Output path for a D1 SQL backup
  -h, --help                   Show help
  -v, --version                Show CLI version
`;

async function run(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.version || flags.command === 'version') {
    process.stdout.write(`venda ${await cliVersion()}\n`);
    return;
  }
  if (flags.help || !flags.command || flags.command === 'help') {
    process.stdout.write(HELP);
    return;
  }

  switch (flags.command) {
    case 'init': await init(flags); break;
    case 'deploy': await deploy(flags, 'deploy'); break;
    case 'update': await deploy(flags, 'update'); break;
    case 'migrate': await migrate(flags); break;
    case 'status': await status(flags); break;
    case 'doctor': await doctor(flags); break;
    case 'admin': await admin(flags); break;
    case 'backup': await backup(flags); break;
    case 'logs': await logs(flags); break;
    case 'uninstall': await uninstall(flags); break;
    case 'config': await config(flags); break;
    default: throw new UsageError(`Unknown command "${flags.command}". Run \`venda --help\` to see available commands.`);
  }
}

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  p.log.error(message);
  if (process.env.VENDA_DEBUG === '1' && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
