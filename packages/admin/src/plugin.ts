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

export interface AdminPlugin {
  readonly id: string;
  readonly pages: ReadonlyArray<AdminPage>;
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

export function registerPlugins(
  plugins: ReadonlyArray<AdminPlugin>
): AdminPage[] {
  const ids = new Set<string>();
  const routes = new Set<string>();
  const pages: AdminPage[] = [];

  for (const plugin of plugins) {
    if (ids.has(plugin.id))
      throw new Error(`Duplicate admin plugin: ${plugin.id}`);

    ids.add(plugin.id);

    for (const page of plugin.pages) {
      const route = page.path.replaceAll(/:[^/]+/g, ':parameter');

      if (ids.has(page.id) || routes.has(route))
        throw new Error(`Duplicate admin page: ${page.id} (${page.path})`);

      ids.add(page.id);
      routes.add(route);
      pages.push(page);
    }
  }

  return pages;
}
