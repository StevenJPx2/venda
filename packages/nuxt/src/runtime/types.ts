/** A published entry as returned by Venda's public content API. */
export interface VendaEntry<TData = Record<string, unknown>> {
  id: string;
  collectionId: string;
  slug: string;
  data: TData;
  status: 'published';
  createdAt: string;
  updatedAt: string;
}

export interface VendaCollectionOptions<TData> {
  /** Sort by a field inside `data` (e.g. `'order'`). Defaults to the API order: most recently updated first. */
  sortBy?: Extract<keyof TData, string>;
  /** Sort direction for `sortBy`. Defaults to `'asc'`. */
  order?: 'asc' | 'desc';
  /** Keep at most this many entries (applied after sorting). */
  limit?: number;
}
