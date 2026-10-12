// The site's own words in the admin, from `content/site.ts`.
import type { SiteSettings } from '@venda/contract';

/** The shell's own Settings page, which `site.ts` names `settings`. */
export const SETTINGS_SCREEN = {
  id: 'settings',
  title: 'Settings',
  description: 'How this site is set up: its files, its people and its keys.'
} as const;

/** A screen's description: the site's words for it, else its plugin's; an empty string shows none. */
export function screenDescription(
  site: SiteSettings | null,
  id: string,
  fallback: string | undefined
): string | undefined {
  const text = site?.screens[id] ?? fallback;

  return text ? text : undefined;
}

/** A window title, named for the site once `site.ts` names it. */
export const windowTitle = (site: SiteSettings | null, title: string) =>
  `${title} · ${site?.name ?? 'Venda'}`;
