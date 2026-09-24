import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Cloudflare resources backing one install. Created by `venda init`. */
export interface ResourceRefs {
  d1: { name: string; id: string };
  kv: { title: string; id: string };
  r2: { name: string };
}

/** Contents of `venda.json`: everything that identifies one self-hosted install. */
export interface VendaProject {
  /** Worker name and resource prefix. */
  name: string;
  accountId: string;
  adminEmail: string;
  /** Custom domain on a Cloudflare zone you own; omitted means workers.dev. */
  domain?: string;
  /** Extra origins allowed to call admin endpoints (for a separately hosted admin). */
  adminOrigins?: string[];
  resources?: ResourceRefs;
  /** Venda release currently deployed. */
  version?: string;
  url?: string;
}

export class ProjectError extends Error {
  override name = 'ProjectError';
}

export const CONFIG_FILE = 'venda.json';
const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}[a-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function nameProblem(name: string): string | undefined {
  return NAME_PATTERN.test(name) ? undefined : 'Use 3–42 lowercase letters, digits or hyphens, starting with a letter.';
}

export function emailProblem(email: string): string | undefined {
  return EMAIL_PATTERN.test(email) ? undefined : 'Enter a valid email address.';
}

export function domainProblem(domain: string): string | undefined {
  return DOMAIN_PATTERN.test(domain) ? undefined : 'Enter a hostname like cms.example.com (no https://).';
}

/** Suggests an install name from a directory name. */
export function suggestName(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  return nameProblem(slug) ? 'venda' : slug;
}

export function resourceNames(name: string) {
  return { d1: `${name}-content`, kv: `${name}-cache`, r2: `${name}-media` };
}

function text(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ProjectError(`${CONFIG_FILE}: "${key}" must be a string.`);
  return value;
}

function required(raw: Record<string, unknown>, key: string): string {
  const value = text(raw, key);
  if (!value) throw new ProjectError(`${CONFIG_FILE}: "${key}" is required.`);
  return value;
}

function parseResources(raw: unknown): ResourceRefs | undefined {
  if (raw === undefined) return undefined;
  const r = raw as Partial<ResourceRefs>;
  if (!r?.d1?.name || !r.d1.id || !r.kv?.title || !r.kv.id || !r.r2?.name) {
    throw new ProjectError(`${CONFIG_FILE}: "resources" is incomplete. Run \`venda doctor\`.`);
  }
  return { d1: { name: r.d1.name, id: r.d1.id }, kv: { title: r.kv.title, id: r.kv.id }, r2: { name: r.r2.name } };
}

export function parseProject(raw: unknown): VendaProject {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ProjectError(`${CONFIG_FILE} must contain a JSON object.`);
  const record = raw as Record<string, unknown>;

  const project: VendaProject = { name: required(record, 'name'), accountId: required(record, 'accountId'), adminEmail: required(record, 'adminEmail') };
  const problem = nameProblem(project.name) ?? emailProblem(project.adminEmail);
  if (problem) throw new ProjectError(`${CONFIG_FILE}: ${problem}`);

  const domain = text(record, 'domain');
  if (domain) {
    const domainError = domainProblem(domain);
    if (domainError) throw new ProjectError(`${CONFIG_FILE}: ${domainError}`);
    project.domain = domain;
  }
  if (record.adminOrigins !== undefined) {
    if (!Array.isArray(record.adminOrigins) || !record.adminOrigins.every(o => typeof o === 'string')) throw new ProjectError(`${CONFIG_FILE}: "adminOrigins" must be a list of strings.`);
    if (record.adminOrigins.length) project.adminOrigins = record.adminOrigins as string[];
  }

  const resources = parseResources(record.resources);
  const version = text(record, 'version');
  const url = text(record, 'url');
  if (resources) project.resources = resources;
  if (version) project.version = version;
  if (url) project.url = url;
  return project;
}

export async function loadProject(dir: string): Promise<VendaProject> {
  let contents: string;
  try {
    contents = await readFile(join(dir, CONFIG_FILE), 'utf8');
  } catch {
    throw new ProjectError(`No ${CONFIG_FILE} in ${dir}. Run \`venda init\` first, or pass --dir.`);
  }
  try {
    return parseProject(JSON.parse(contents));
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError(`${CONFIG_FILE} is not valid JSON.`);
  }
}

export async function saveProject(dir: string, project: VendaProject): Promise<void> {
  await writeFile(join(dir, CONFIG_FILE), `${JSON.stringify(project, null, 2)}\n`);
}
