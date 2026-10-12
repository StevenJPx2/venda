import type { CollectionField, IndexedEntry, Role } from '@venda/contract';
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
   * What the screen is for, under its title and beside its link on the
   * Settings page. The site's `content/site.ts` may replace it by page id.
   */
  readonly description?: string;
  /**
   * Where the page is listed: content pages in the sidebar, settings pages on
   * the Settings page, account pages in the account menu.
   */
  readonly nav?: {
    readonly label: string;
    readonly icon: string;
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

/** The screen for one entry. Its component receives `collection` and `edit` (an EntryEdit). */
export type AdminEditor = CollectionSlot;

/** A value of one field, as an entry's data holds it. */
export type FieldValue = IndexedEntry['data'][string];

/**
 * The input for a field type. Its component receives `field` (the model's
 * CollectionField), `modelValue` (the value, or null when unset) and
 * `readonly`, and emits `update:modelValue`.
 */
export interface AdminField {
  readonly id: string;
  readonly label: string;
  /** The field types it edits; the last registered input for a type is used. */
  readonly types: ReadonlyArray<string>;
  readonly load: () => Promise<{ default: Component }>;
}

/**
 * What an editor edits: one entry's working copy. The shell saves and
 * publishes it; an editor only reads values and sets them.
 */
export interface EntryEdit {
  readonly slug: string;
  readonly data: Readonly<Record<string, FieldValue>>;
  readonly publishedAt: string | null;
  /** Nothing may be changed: the person may only read it, or it is publishing. */
  readonly readonly: boolean;
  readonly set: (key: string, value: FieldValue | null) => void;
  readonly setPublishedAt: (value: string | null) => void;
}

export interface AdminPlugin {
  readonly id: string;
  readonly pages?: ReadonlyArray<AdminPage>;
  readonly views?: ReadonlyArray<AdminView>;
  readonly editors?: ReadonlyArray<AdminEditor>;
  readonly fields?: ReadonlyArray<AdminField>;
}

/** Everything the installed plugins contribute, checked once at build time. */
export interface AdminRegistry {
  readonly pages: ReadonlyArray<AdminPage>;
  readonly views: ReadonlyArray<AdminView>;
  readonly editors: ReadonlyArray<AdminEditor>;
  readonly fields: ReadonlyArray<AdminField>;
}

/** A field's label as config.ts gives it, or its key with a capital. */
export const fieldLabel = (field: Pick<CollectionField, 'key' | 'label'>) =>
  field.label ?? field.key.charAt(0).toUpperCase() + field.key.slice(1);

/** The input for a field type: the last registered one that edits it. */
export const chooseField = (
  fields: ReadonlyArray<AdminField>,
  type: string
): AdminField | undefined =>
  fields.findLast(field => field.types.includes(type));

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

/** Every contribution of one kind, in plugin order, each id claimed once. */
function gather<T extends { readonly id: string }>(
  ids: Set<string>,
  lists: ReadonlyArray<ReadonlyArray<T> | undefined>,
  what: string
): T[] {
  const all = lists.flatMap(list => list ?? []);

  for (const item of all) claim(ids, item.id, what);

  return all;
}

/** Pages also may not share a route, whatever their parameters are named. */
function claimRoutes(pages: ReadonlyArray<AdminPage>) {
  const routes = new Set<string>();

  for (const page of pages) {
    const route = page.path.replaceAll(/:[^/]+/g, ':parameter');

    if (routes.has(route))
      throw new Error(`Duplicate admin page: ${page.id} (${page.path})`);

    routes.add(route);
  }
}

export function registerPlugins(
  plugins: ReadonlyArray<AdminPlugin>
): AdminRegistry {
  const ids = new Set<string>();

  gather(ids, [plugins], 'plugin');

  const pages = gather(
    ids,
    plugins.map(each => each.pages),
    'page'
  );

  claimRoutes(pages);

  return {
    pages,
    views: gather(
      ids,
      plugins.map(each => each.views),
      'view'
    ),
    editors: gather(
      ids,
      plugins.map(each => each.editors),
      'editor'
    ),
    fields: gather(
      ids,
      plugins.map(each => each.fields),
      'field'
    )
  };
}
