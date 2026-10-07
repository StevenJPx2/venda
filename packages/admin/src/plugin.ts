import type { Role } from '@venda/contract';
import type { Component } from 'vue';
import type { AdminRuntime } from './runtime';

/** A link a page lists beneath its heading in the sidebar. */
export interface NavItem {
  readonly label: string;
  readonly icon: string;
  readonly to: string;
  /** Items of one group sit together; the sidebar leaves a gap between groups. */
  readonly group: string;
}

/** Build-time contributions, never fetched as executable code at runtime. */
export interface AdminPage {
  readonly id: string;
  /** Relative to /admin; named segments use :name. */
  readonly path: string;
  readonly title: string;
  readonly section: 'content' | 'settings' | 'account' | 'public';
  readonly access: 'public' | 'signed-in' | 'administrator';
  readonly load: () => Promise<{ default: Component }>;
  /**
   * Where the page is listed: content pages in the sidebar, settings pages on
   * the Settings page (with their description), account pages in the account
   * menu.
   */
  readonly nav?: {
    readonly label: string;
    readonly icon: string;
    readonly description?: string;
    /**
     * Links listed beneath the label, which then becomes a sidebar heading
     * (Content, with each collection under it). Loaded when the sidebar
     * shows, and again on every navigation, so new data appears.
     */
    readonly items?: (admin: AdminRuntime) => Promise<ReadonlyArray<NavItem>>;
  };
}

export type CollectionKind = 'posts' | 'pages' | 'single' | 'records';

/** A part of the content screens a plugin contributes for collections. */
export interface CollectionSlot {
  /** Unique across plugins; a collection's config.ts may name it to choose it. */
  readonly id: string;
  readonly label: string;
  /** The kinds it serves when a collection names no other. */
  readonly kinds: ReadonlyArray<CollectionKind>;
  readonly load: () => Promise<{ default: Component }>;
}

/** How a collection is browsed. Its component receives `collection`. */
export type AdminView = CollectionSlot;

/** The screen for one entry. Its component receives `collection` and `entry`. */
export type AdminEditor = CollectionSlot;

export interface AdminPlugin {
  readonly id: string;
  readonly pages?: ReadonlyArray<AdminPage>;
  readonly views?: ReadonlyArray<AdminView>;
  readonly editors?: ReadonlyArray<AdminEditor>;
}

/** Everything the installed plugins contribute, checked once at build time. */
export interface AdminRegistry {
  readonly pages: ReadonlyArray<AdminPage>;
  readonly views: ReadonlyArray<AdminView>;
  readonly editors: ReadonlyArray<AdminEditor>;
}

export interface Chosen<S> {
  readonly slot: S | undefined;
  /** A name the collection's config.ts gave that no installed plugin provides. */
  readonly missing: string | undefined;
}

/**
 * What shows a collection: the view or editor its config.ts names, else the
 * last registered one serving its kind, so a site's own plugin, listed after
 * the default preset, replaces a default.
 */
export function choose<S extends CollectionSlot>(
  slots: ReadonlyArray<S>,
  kind: CollectionKind,
  named: string | null
): Chosen<S> {
  const byName =
    named === null ? undefined : slots.find(slot => slot.id === named);

  return {
    slot: byName ?? slots.findLast(slot => slot.kinds.includes(kind)),
    missing: named !== null && byName === undefined ? named : undefined
  };
}

/** The listed pages of one section that this role may open, in registration order. */
export const listed = (
  pages: ReadonlyArray<AdminPage>,
  section: AdminPage['section'],
  role: Role | undefined
) =>
  pages.filter(
    page => page.section === section && page.nav && canOpen(page, role)
  );

export function canOpen(page: AdminPage, role: Role | undefined): boolean {
  return (
    page.access === 'public' ||
    (role !== undefined &&
      (page.access === 'signed-in' || role === 'administrator'))
  );
}

/** A registered page with its parameters, or no match. Routes are checked at build time for duplicates. */
export function resolvePage(pages: ReadonlyArray<AdminPage>, path: string) {
  const segments = path.split('/').filter(Boolean);

  for (const page of pages) {
    const pattern = page.path.split('/').filter(Boolean);

    if (pattern.length !== segments.length) continue;

    const params: Record<string, string> = {};

    const matches = pattern.every((part, index) => {
      const value = segments[index] ?? '';

      if (part.startsWith(':')) params[part.slice(1)] = value;

      return part.startsWith(':') || part === value;
    });

    if (matches) return { page, params };
  }
}

/** Adds an id, refusing one any plugin, page, view or editor already uses. */
function claim(ids: Set<string>, id: string, what: string) {
  if (ids.has(id)) throw new Error(`Duplicate admin ${what}: ${id}`);

  ids.add(id);
}

export function registerPlugins(
  plugins: ReadonlyArray<AdminPlugin>
): AdminRegistry {
  const ids = new Set<string>();
  const routes = new Set<string>();
  const pages: AdminPage[] = [];
  const views: AdminView[] = [];
  const editors: AdminEditor[] = [];

  for (const plugin of plugins) {
    claim(ids, plugin.id, 'plugin');

    for (const page of plugin.pages ?? []) {
      const route = page.path.replaceAll(/:[^/]+/g, ':parameter');

      if (routes.has(route))
        throw new Error(`Duplicate admin page: ${page.id} (${page.path})`);

      claim(ids, page.id, 'page');
      routes.add(route);
      pages.push(page);
    }

    for (const view of plugin.views ?? []) {
      claim(ids, view.id, 'view');
      views.push(view);
    }

    for (const editor of plugin.editors ?? []) {
      claim(ids, editor.id, 'editor');
      editors.push(editor);
    }
  }

  return { pages, views, editors };
}
