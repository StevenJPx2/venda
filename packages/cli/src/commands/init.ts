import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { generatePassword, generateSessionSecret } from '../credentials.js';
import { deployRelease, setSecrets, waitForHealth } from '../deploy.js';
import { CONFIG_FILE, domainProblem, emailProblem, loadProject, nameProblem, saveProject, suggestName, type VendaProject } from '../project.js';
import { ensureResources } from '../provision.js';
import { createSampleContent } from '../sample.js';
import { UsageError, answer, confirmOption, p, step, textOption } from '../ui.js';
import { createRunner, parseWhoami, type Account, type Runner } from '../wrangler.js';
import type { Flags } from '../flags.js';

const GITIGNORE = '# Venda release files (re-created by `venda deploy`)\n.venda/\n.wrangler/\nnode_modules/\n';

async function ensureLoggedIn(runner: Runner, noPrompt: boolean): Promise<Account[]> {
  let who = parseWhoami((await runner(['whoami', '--json'])).stdout || '{}');
  if (!who.loggedIn && !noPrompt) {
    p.log.info('Sign in to Cloudflare in the browser window that opens.');
    await runner(['login'], { inherit: true });
    who = parseWhoami((await runner(['whoami', '--json'])).stdout || '{}');
  }
  if (!who.loggedIn) throw new UsageError('Not signed in to Cloudflare. Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN for CI.');
  if (!who.accounts.length) throw new UsageError('Your Cloudflare login has no accounts available.');
  return who.accounts;
}

async function chooseAccount(accounts: Account[], flag: string | undefined, noPrompt: boolean): Promise<Account> {
  if (flag) {
    const match = accounts.find(a => a.id === flag || a.name === flag);
    if (!match) throw new UsageError(`--account "${flag}" is not one of your accounts: ${accounts.map(a => a.name).join(', ')}.`);
    return match;
  }
  if (accounts.length === 1) return accounts[0]!;
  if (noPrompt) throw new UsageError(`You have ${accounts.length} Cloudflare accounts; choose one with --account.`);
  const id = answer(await p.select({ message: 'Which Cloudflare account should host Venda?', options: accounts.map(a => ({ value: a.id, label: a.name, hint: a.id })) }));
  return accounts.find(a => a.id === id)!;
}

async function gatherProject(dir: string, flags: Flags, accountId: string): Promise<VendaProject> {
  const name = await textOption({ flag: flags.name, flagName: 'name', noPrompt: flags.noPrompt, message: 'Name for this install (used for the Worker and its resources)', initialValue: suggestName(basename(dir)), validate: nameProblem });
  const adminEmail = await textOption({ flag: flags.email, flagName: 'email', noPrompt: flags.noPrompt, message: 'Admin email (you will sign in with this)', placeholder: 'you@example.com', validate: emailProblem });
  const domain = await textOption({ flag: flags.domain, flagName: 'domain', noPrompt: flags.noPrompt, optional: true, message: 'Custom domain (optional — leave empty to use workers.dev)', placeholder: 'cms.example.com', validate: domainProblem });

  return { name, accountId, adminEmail: adminEmail.toLowerCase(), ...(domain ? { domain } : {}) };
}

async function ensureInstallDir(dir: string): Promise<VendaProject | undefined> {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  const existing = entries.includes(CONFIG_FILE) ? await loadProject(dir) : undefined;
  if (existing?.resources && (existing.version || existing.url)) throw new UsageError(`${dir} is already a deployed Venda install. Use \`venda deploy\` or \`venda update\` there.`);
  const unexpected = entries.filter(entry => !entry.startsWith('.') && entry !== CONFIG_FILE);
  if (unexpected.length) throw new UsageError(`${dir} is not empty. Choose a new directory for the install.`);
  return existing;
}

async function writeGitignore(dir: string): Promise<void> {
  const path = join(dir, '.gitignore');
  let current = '';
  try {
    current = await readFile(path, 'utf8');
  } catch {
    // Create it below when this is a new install.
  }
  const missing = GITIGNORE.split('\n').filter(line => line && !current.split(/\r?\n/).includes(line));
  if (missing.length) await writeFile(path, `${current.trimEnd()}${current.trimEnd() ? '\n' : ''}${missing.join('\n')}\n`);
}

export async function init(flags: Flags): Promise<void> {
  p.intro('Venda · self-hosted setup');
  const dir = resolve(flags.positionals[0] ?? flags.dir);
  const existing = await ensureInstallDir(dir);

  const accounts = await ensureLoggedIn(createRunner(), flags.noPrompt);
  const account = existing
    ? accounts.find(item => item.id === existing.accountId)
    : await chooseAccount(accounts, flags.account, flags.noPrompt);
  if (!account) throw new UsageError(`The incomplete install belongs to Cloudflare account ${existing?.accountId}, which this login cannot access.`);
  if (existing && flags.account && flags.account !== existing.accountId && flags.account !== account.name) {
    throw new UsageError(`This incomplete install is configured for account ${existing.accountId}; resume it with that account or remove venda.json to start over.`);
  }
  const project = existing ?? await gatherProject(dir, flags, account.id);
  if (existing && (flags.name && flags.name !== existing.name || flags.email && flags.email.toLowerCase() !== existing.adminEmail || flags.domain && flags.domain !== existing.domain)) {
    throw new UsageError('This is a partially initialized Venda install. Resume using its saved name, email and domain, or edit venda.json first.');
  }
  const withSample = await confirmOption({ flag: flags.sample, noPrompt: flags.noPrompt, message: 'Add a welcome post to start from?', initialValue: true });

  const runner = createRunner(account.id);
  await writeGitignore(dir);
  await saveProject(dir, project);

  project.resources = await step('Creating Cloudflare resources', update => ensureResources(runner, project.name, update), () => 'Created D1, KV and R2');
  await saveProject(dir, project);

  const deployed = await step('Deploying Venda', update => deployRelease(runner, dir, project, update), result => `Deployed v${result.version}`);
  const password = generatePassword();
  await step('Setting admin credentials', () => setSecrets(runner, dir, { ADMIN_PASSWORD: password, SESSION_SECRET: generateSessionSecret() }));

  const health = await step('Waiting for your install to come online', () => waitForHealth(deployed.url), h => (h.ok ? 'Online' : 'Still starting up'));
  if (health.ok && withSample) {
    await step('Adding a welcome post', () => createSampleContent(deployed.url, project.adminEmail, password), () => 'Added “Welcome to Venda”');
  }

  printSummary(dir, deployed.url, project.adminEmail, password, health.ok);
}

function printSummary(dir: string, url: string, email: string, password: string, online: boolean): void {
  const where = relative(process.cwd(), dir) || '.';
  p.note([
    `Admin     ${url}`,
    `API       ${url}/api/content/<collection>`,
    `Email     ${email}`,
    `Password  ${password}`,
    '',
    'This password is shown once. Store it in a password manager,',
    'or rotate it any time with `venda admin password`.'
  ].join('\n'), 'Your Venda is ready');

  if (!online) p.log.warn('The Worker is deployed but not answering yet — new workers.dev URLs can take a minute. Check with `venda doctor`.');
  p.outro(`Next: cd ${where} && npx venda status`);
}
