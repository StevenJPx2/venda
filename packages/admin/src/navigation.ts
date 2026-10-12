// Plugins register work that must finish before leaving their screen. The
// shell runs it before changing routes; a failure keeps the screen mounted.
export function navigationChecks() {
  const checks = new Set<() => Promise<void>>();

  const beforeNavigate = (check: () => Promise<void>) => {
    checks.add(check);

    return () => {
      checks.delete(check);
    };
  };

  async function prepareNavigation(): Promise<boolean> {
    try {
      for (const check of checks) await check();

      return true;
    } catch {
      return false;
    }
  }

  return { beforeNavigate, prepareNavigation };
}
