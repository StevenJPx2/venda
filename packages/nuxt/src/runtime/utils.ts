import type { VendaCollectionOptions, VendaEntry } from './types';

/** Joins the configured API base and a content path without doubling slashes. */
export function contentUrl(apiBase: string, collection: string, slug?: string): string {
  const base = apiBase.replace(/\/+$/, '');
  const path = [collection, slug].filter((part): part is string => Boolean(part)).map(encodeURIComponent).join('/');
  return `${base}/content/${path}`;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Applies client-side sorting and limiting; the API itself returns newest-first. */
export function shapeEntries<TData>(entries: VendaEntry<TData>[], options: VendaCollectionOptions<TData> = {}): VendaEntry<TData>[] {
  const { sortBy, order = 'asc', limit } = options;
  let shaped = [...entries];

  if (sortBy) {
    const direction = order === 'desc' ? -1 : 1;
    shaped.sort((a, b) => {
      const result = compare(a.data[sortBy], b.data[sortBy]);
      // Entries missing the field always sort last, whatever the direction.
      const aMissing = a.data[sortBy] === undefined || a.data[sortBy] === null;
      const bMissing = b.data[sortBy] === undefined || b.data[sortBy] === null;
      return aMissing || bMissing ? result : result * direction;
    });
  }

  if (typeof limit === 'number' && limit >= 0) shaped = shaped.slice(0, limit);

  return shaped;
}

/** Stable, option-aware cache key so SSR payloads and client hydration match. */
export function collectionKey<TData>(collection: string, options: VendaCollectionOptions<TData> = {}): string {
  return ['venda', collection, options.sortBy ?? '', options.order ?? '', options.limit ?? ''].join(':');
}

export function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { statusCode, status } = error as { statusCode?: number; status?: number };
  return statusCode === 404 || status === 404;
}
