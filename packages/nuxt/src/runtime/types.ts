import type { PublicEntry } from '@venda/contract';

/** A published entry as the content API sends it (`PublicEntry`), with the site's own type for its fields. */
export type VendaEntry<TData = Record<string, unknown>> = Omit<
  typeof PublicEntry.Encoded,
  'data'
> & { readonly data: TData };

export interface VendaCollectionOptions<TData> {
  /** Sort by a field inside `data` (e.g. `'order'`). Defaults to the API order: most recently updated first. */
  sortBy?: Extract<keyof TData, string>;
  /** Sort direction for `sortBy`. Defaults to `'asc'`. */
  order?: 'asc' | 'desc';
  /** Keep at most this many entries (applied after sorting). */
  limit?: number;
}
