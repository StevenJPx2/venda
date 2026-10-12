// Settings → General edits each screen's description in site.ts: the words its
// plugin ships, the site's own words, or none. The list also shows ids that no
// installed screen has, so a typo in one can be seen and removed.
import { SETTINGS_SCREEN, type AdminPage } from '@venda/admin';
import type { SiteSettings } from '@venda/contract';

export type ScreenMode = 'default' | 'own' | 'hidden';

export interface ScreenDraft {
  readonly id: string;
  readonly title: string;
  /** The words the screen's plugin ships; empty for an id no screen has. */
  readonly fallback: string;
  readonly mode: ScreenMode;
  readonly text: string;
  /** No installed screen has this id. */
  readonly stray: boolean;
}

type Described = Pick<AdminPage, 'id' | 'title' | 'description'>;

function draftOf(
  screen: Described,
  screens: SiteSettings['screens']
): ScreenDraft {
  const own = screens[screen.id];
  const base = {
    id: screen.id,
    title: screen.title,
    fallback: screen.description ?? '',
    stray: false
  };

  if (own === undefined) return { ...base, mode: 'default', text: '' };

  return own
    ? { ...base, mode: 'own', text: own }
    : { ...base, mode: 'hidden', text: '' };
}

/** Every screen with a description, then the site's ids that match none. */
export function screenDrafts(
  pages: ReadonlyArray<AdminPage>,
  site: SiteSettings | null
): ScreenDraft[] {
  const screens = site?.screens ?? {};
  const described: Described[] = [
    SETTINGS_SCREEN,
    ...pages.filter(
      page => page.description !== undefined || Object.hasOwn(screens, page.id)
    )
  ];
  const known = new Set(described.map(screen => screen.id));
  const strays = Object.entries(screens)
    .filter(([id]) => !known.has(id))
    .map(([id, text]): ScreenDraft => ({
      id,
      title: id,
      fallback: '',
      mode: text ? 'own' : 'hidden',
      text,
      stray: true
    }));

  return [...described.map(screen => draftOf(screen, screens)), ...strays];
}

/** The request that writes the settings, from the file's SHA they were read at. */
export const siteRequest = (
  sha: string | null,
  name: string,
  url: string,
  drafts: ReadonlyArray<ScreenDraft>
) => ({
  payload: { baseSha: sha, name, url, screens: screensFrom(drafts) }
});

/** What site.ts records for the drafts: own words, or an empty string to hide one. */
export function screensFrom(
  drafts: ReadonlyArray<ScreenDraft>
): Record<string, string> {
  return Object.fromEntries(
    drafts.flatMap(draft => {
      if (draft.mode === 'hidden') return [[draft.id, '']];

      return draft.mode === 'own' && draft.text.trim()
        ? [[draft.id, draft.text.trim()]]
        : [];
    })
  );
}
