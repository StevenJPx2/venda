import type { IndexedEntry } from '@venda/contract';
import { Predicate } from 'effect';

/** A model's title field, or the slug when a file has no title yet. */
export function entryTitle(entry: Pick<IndexedEntry, 'data' | 'slug'>, field: string | null): string {
  const value = field === null ? undefined : entry.data[field];

  return Predicate.isString(value) && value.trim() ? value : entry.slug;
}
