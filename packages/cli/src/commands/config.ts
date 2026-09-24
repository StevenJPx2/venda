import { resolve } from 'node:path';
import { loadProject, parseProject, saveProject } from '../project.js';
import { UsageError, p } from '../ui.js';
import type { Flags } from '../flags.js';

const ALIASES: Record<string, keyof Pick<NonNullable<Awaited<ReturnType<typeof loadProject>>>, 'name' | 'adminEmail' | 'domain' | 'adminOrigins'>> = {
  name: 'name',
  domain: 'domain',
  'admin-email': 'adminEmail',
  'admin-origins': 'adminOrigins'
};

export async function config(flags: Flags): Promise<void> {
  const dir = resolve(flags.dir);
  const project = await loadProject(dir);
  const [action, key, ...rest] = flags.positionals;
  if (!action || action === 'get') {
    if (!key) p.note(JSON.stringify(project, null, 2), 'venda.json');
    else {
      const property = ALIASES[key];
      if (!property) throw new UsageError(`Unknown setting "${key}". Available: ${Object.keys(ALIASES).join(', ')}.`);
      p.log.info(`${key} = ${JSON.stringify(project[property] ?? null)}`);
    }
    return;
  }

  if (action !== 'set' || !key || !rest.length) {
    throw new UsageError('Usage: venda config [get [key] | set <key> <value>]');
  }
  const property = ALIASES[key];
  if (!property) throw new UsageError(`Unknown setting "${key}". Available: ${Object.keys(ALIASES).join(', ')}.`);
  const value = rest.join(' ');
  if (property === 'domain') {
    if (value === '-') delete project.domain;
    else project.domain = value;
  } else if (property === 'adminEmail') {
    project.adminEmail = value;
  } else if (property === 'adminOrigins') {
    project.adminOrigins = value === '-' ? [] : value.split(',').map(origin => origin.trim()).filter(Boolean);
  } else {
    project.name = value;
  }
  parseProject(project);
  await saveProject(dir, project);
  p.log.success(`Updated ${key}. Run \`venda deploy\` to apply the change.`);
}
