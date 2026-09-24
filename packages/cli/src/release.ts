import { cp, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The Venda release bundled with this CLI version. */
export async function cliVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/** Worker bundle, admin SPA and migrations shipped inside the CLI package. */
export function bundledServerDir(): string {
  return join(packageRoot, 'server');
}

export function releasePath(version: string): string {
  return `.venda/versions/${version}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unpacks this CLI's release into `<project>/.venda/versions/<version>`
 * (Ghost-style versioned installs) and returns its project-relative path.
 * Re-installing the same version replaces it, so a broken copy self-heals.
 */
export async function installRelease(projectDir: string, version: string): Promise<string> {
  const source = bundledServerDir();
  if (!(await exists(join(source, 'worker', 'index.js')))) {
    throw new Error(`This venda CLI is missing its bundled release (${source}). Reinstall the CLI, or run \`pnpm --filter venda build\` in a source checkout.`);
  }

  const relative = releasePath(version);
  const target = join(projectDir, relative);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  return relative;
}
