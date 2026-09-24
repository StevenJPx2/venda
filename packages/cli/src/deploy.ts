import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { saveProject, type VendaProject } from './project.js';
import { cliVersion, installRelease } from './release.js';
import { WRANGLER_FILE, renderWranglerConfig, serializeWranglerConfig } from './render.js';
import { parseDeployUrl, wrangler, type Runner } from './wrangler.js';

export interface DeployResult {
  url: string;
  version: string;
  previousVersion?: string;
}

/** Renders wrangler.jsonc for the release this CLI ships; returns the release dir. */
export async function prepareRelease(dir: string, project: VendaProject): Promise<{ releaseDir: string; version: string }> {
  if (!project.resources) throw new Error('This install has no resources yet. Run `venda init` to finish setting it up.');
  const version = await cliVersion();
  const releaseDir = await installRelease(dir, version);
  const config = renderWranglerConfig(project, project.resources, releaseDir, version);
  await writeFile(join(dir, WRANGLER_FILE), serializeWranglerConfig(config));
  return { releaseDir, version };
}

export async function applyMigrations(runner: Runner, dir: string): Promise<void> {
  // Non-interactive runs skip Wrangler's confirmation; D1 still takes a backup first.
  await wrangler(runner, ['d1', 'migrations', 'apply', 'VENDA_DB', '--remote'], { cwd: dir });
}

/**
 * Deploys the release bundled with this CLI: unpack it, render config, migrate
 * the database, then ship the Worker. Migrations run first so new code never
 * meets an old schema.
 */
export async function deployRelease(runner: Runner, dir: string, project: VendaProject, onStep: (message: string) => void = () => {}): Promise<DeployResult> {
  onStep('Preparing release');
  const { version } = await prepareRelease(dir, project);

  onStep('Applying database migrations');
  await applyMigrations(runner, dir);

  onStep('Deploying Worker');
  const output = await wrangler(runner, ['deploy'], { cwd: dir });
  const url = parseDeployUrl(output, project.domain) ?? project.url;
  if (!url) throw new Error('Deployed, but Wrangler did not report a URL. Check the Workers dashboard, or set a domain in venda.json.');

  const result: DeployResult = { url, version, ...(project.version && project.version !== version ? { previousVersion: project.version } : {}) };
  await saveProject(dir, { ...project, version, url });
  return result;
}

/** Sets Worker secrets via stdin so they are never written to disk. */
export async function setSecrets(runner: Runner, dir: string, secrets: Record<string, string>): Promise<void> {
  await wrangler(runner, ['secret', 'bulk'], { cwd: dir, input: JSON.stringify(secrets) });
}

/** Polls /api/health until the Worker answers (new workers.dev routes can take a moment). */
export async function waitForHealth(url: string, timeoutMs = 90_000): Promise<{ ok: boolean; version?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { headers: { 'cache-control': 'no-cache' } });
      if (response.ok) return { ok: true, ...(await response.json() as { version?: string }) };
    } catch {
      // DNS or TLS not ready yet; keep polling.
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  return { ok: false };
}
