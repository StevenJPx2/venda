import type { IndexedEntry } from '@venda/contract';
import { Predicate } from 'effect';

/** A model's title field, or the slug when a file has no title yet. */
export function entryTitle(entry: Pick<IndexedEntry, 'data' | 'slug'>, field: string | null): string {
  const value = field === null ? undefined : entry.data[field];

  return Predicate.isString(value) && value.trim() ? value : entry.slug;
}

/** A frontmatter value as it reads in the preview: text as written, a list of text as a list, anything else as JSON. */
export function fieldText(value: IndexedEntry['data'][string]): string {
  if (Predicate.isString(value)) return value;

  if (Array.isArray(value) && value.every(Predicate.isString)) return value.join(', ');

  return JSON.stringify(value);
}

const STATE_LABELS: Record<IndexedEntry['state'], string> = { published: 'Published', draft: 'Draft', future: 'Future dated' };

/** The status text beside an entry's dot. */
export const stateLabel = (state: IndexedEntry['state']): string => STATE_LABELS[state];
