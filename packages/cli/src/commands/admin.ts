import { resolve } from 'node:path';
import { generatePassword, generateSessionSecret } from '../credentials.js';
import { setSecrets } from '../deploy.js';
import { loadProject } from '../project.js';
import { UsageError, answer, p, step } from '../ui.js';
import { createRunner } from '../wrangler.js';
import type { Flags } from '../flags.js';

function passwordProblem(value: string | undefined): string | undefined {
  return (value?.length ?? 0) < 12 ? 'Use at least 12 characters.' : undefined;
}

async function newPassword(flags: Flags): Promise<{ value: string; generated: boolean }> {
  if (flags.password !== undefined) {
    const issue = passwordProblem(flags.password);
    if (issue) throw new UsageError(`--password: ${issue}`);
    return { value: flags.password, generated: false };
  }
  if (flags.noPrompt) return { value: generatePassword(), generated: true };

  const first = answer(await p.password({ message: 'New admin password', validate: passwordProblem }));
  const second = answer(await p.password({ message: 'Confirm new admin password' }));
  if (first !== second) throw new UsageError('Passwords do not match. Run `venda admin password` to try again.');
  return { value: first, generated: false };
}

export async function admin(flags: Flags): Promise<void> {
  const action = flags.positionals[0];
  if (action !== 'password') throw new UsageError('Usage: venda admin password [--password <value>] [--sign-out-everyone]');

  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  if (!project.resources) throw new UsageError('This install has no Cloudflare resources yet.');
  const password = await newPassword(flags);
  const secrets: Record<string, string> = { ADMIN_PASSWORD: password.value };
  if (flags.signOutEveryone) secrets.SESSION_SECRET = generateSessionSecret();

  p.intro(`Venda · admin password for ${project.name}`);
  await step('Updating admin credentials', () => setSecrets(createRunner(project.accountId), dir, secrets), () => 'Credentials updated');
  if (password.generated) p.note(password.value, 'New password — shown once');
  if (flags.signOutEveryone) p.log.info('All existing sessions have been signed out.');
  p.outro('Done');
}
