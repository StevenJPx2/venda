// What Settings → General lists about each screen's description: the words
// it shows and where they come from, so an owner can find a screen's id for
// site.ts and see a typo in one.
import { SETTINGS_SCREEN, type AdminPage } from '@venda/admin';
import type { SiteSettings } from '@venda/contract';

export interface ScreenCopy {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly source: string;
}

type Described = Pick<AdminPage, 'id' | 'title' | 'description'>;

function copyOf(screen: Described, site: SiteSettings | null): ScreenCopy {
  const own = site?.screens[screen.id];
  const { id, title } = screen;

  if (own === undefined)
    return { id, title, text: screen.description ?? '', source: 'Default' };

  return own
    ? { id, title, text: own, source: 'From site.ts' }
    : { id, title, text: '', source: 'Hidden by site.ts' };
}

export function screenCopy(
  pages: ReadonlyArray<AdminPage>,
  site: SiteSettings | null
): ScreenCopy[] {
  const screens: Described[] = [
    SETTINGS_SCREEN,
    ...pages.filter(
      page => page.description !== undefined || page.id in (site?.screens ?? {})
    )
  ];
  const known = new Set(screens.map(screen => screen.id));
  const strays = Object.entries(site?.screens ?? {})
    .filter(([id]) => !known.has(id))
    .map(([id, text]) => ({
      id,
      title: id,
      text,
      source: 'No screen has this id'
    }));

  return [...screens.map(screen => copyOf(screen, site)), ...strays];
}
