// What a pull or a push does, worked out from three views of the content
// files, each a map of path to SHA: the folder now, the SHAs it was last
// pulled at (the manifest), and the site. Nothing changed in the folder is
// ever overwritten by a pull unless asked; nothing pushed is based on
// anything but what was pulled.
export type Shas = ReadonlyMap<string, string>;

export interface PullPlan {
  /** Files to fetch from the site into the folder. */
  readonly fetch: string[];
  /** Files to remove from the folder: deleted on the site, unchanged here. */
  readonly remove: string[];
  /** Files changed here and on the site: left as they are here. */
  readonly conflicts: string[];
  /** The manifest after the pull, before fetched files report their SHAs. */
  readonly manifest: Map<string, string>;
}

/** One path's part of a pull. */
function settle(
  plan: PullPlan,
  path: string,
  sides: {
    readonly here: string | undefined;
    readonly base: string | undefined;
    readonly there: string | undefined;
  },
  discard: boolean
) {
  const { here, base, there } = sides;

  if (here === there) {
    if (there === undefined) plan.manifest.delete(path);
    else plan.manifest.set(path, there);

    return;
  }

  if (here !== base && !discard) {
    // Changed here: kept, and a conflict unless the site is still at the base.
    if (there !== base) plan.conflicts.push(path);

    return;
  }

  if (there === undefined) {
    plan.remove.push(path);
    plan.manifest.delete(path);
  } else {
    plan.fetch.push(path);
    plan.manifest.set(path, there);
  }
}

/**
 * Brings the site's changes into the folder: files unchanged here follow
 * the site; files changed here stay. `discard` drops the changes made here
 * to tracked files; new files here are always kept.
 */
export function planPull(
  local: Shas,
  manifest: Shas,
  site: Shas,
  discard: boolean
): PullPlan {
  const plan: PullPlan = {
    fetch: [],
    remove: [],
    conflicts: [],
    manifest: new Map(manifest)
  };
  const paths = new Set([...site.keys(), ...manifest.keys()]);

  for (const path of [...paths].sort())
    settle(
      plan,
      path,
      {
        here: local.get(path),
        base: manifest.get(path),
        there: site.get(path)
      },
      discard
    );

  return plan;
}

export interface Pending {
  readonly path: string;
  readonly kind: 'changed' | 'new' | 'deleted';
  /** The SHA the file was pulled at; null for a new file. */
  readonly baseSha: string | null;
}

/** What changed in the folder since it was pulled, A to Z. */
export function pendingChanges(local: Shas, manifest: Shas): Pending[] {
  const pending: Pending[] = [];

  for (const [path, sha] of local) {
    const base = manifest.get(path);

    if (base === undefined) pending.push({ path, kind: 'new', baseSha: null });
    else if (base !== sha)
      pending.push({ path, kind: 'changed', baseSha: base });
  }

  for (const [path, base] of manifest)
    if (!local.has(path))
      pending.push({ path, kind: 'deleted', baseSha: base });

  return pending.sort((a, b) => a.path.localeCompare(b.path));
}
