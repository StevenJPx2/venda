import type { IndexedEntry } from '@venda/contract';
import { Predicate } from 'effect';

/** A model's title field, or the slug when a file has no title yet. */
export function entryTitle(
  entry: Pick<IndexedEntry, 'data' | 'slug'>,
  field: string | null
): string {
  const value = field === null ? undefined : entry.data[field];

  return Predicate.isString(value) && value.trim() ? value : entry.slug;
}

/** A frontmatter value as it reads in the preview: text as written, a list of text as a list, anything else as JSON. */
export function fieldText(value: IndexedEntry['data'][string]): string {
  if (Predicate.isString(value)) return value;

  if (Array.isArray(value) && value.every(Predicate.isString))
    return value.join(', ');

  return JSON.stringify(value);
}

/** A value in a table cell or text input: blank when left out, yes or no for a switch. */
export function cellText(
  value: IndexedEntry['data'][string] | undefined
): string {
  if (Predicate.isNullish(value)) return '';

  if (Predicate.isBoolean(value)) return value ? 'Yes' : 'No';

  return fieldText(value);
}

/** A short day for list rows ("1 Sept 2026"), or nothing for an undated entry. */
export const dayText = (
  iso: IndexedEntry['publishedAt'],
  locale?: string
): string =>
  iso === null
    ? ''
    : new Date(iso).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

const STATE_LABELS: Record<IndexedEntry['state'], string> = {
  published: 'Published',
  draft: 'Draft',
  future: 'Future dated'
};

/** The status text beside an entry's dot. */
export const stateLabel = (state: IndexedEntry['state']): string =>
  STATE_LABELS[state];

/** A list row's status: unpublished work in the admin first, then the file's state. */
export function rowStatus(entry: Pick<IndexedEntry, 'state' | 'copy'>) {
  if (entry.copy === 'new') return { state: 'draft', label: 'New' } as const;

  if (entry.copy === 'changes')
    return { state: 'draft', label: 'Changes not published' } as const;

  return { state: entry.state, label: stateLabel(entry.state) };
}

/** The slug a title suggests: lowercase words joined by hyphens, accents dropped. */
export const slugOf = (title: string) =>
  title
    .normalize('NFKD')
    .replaceAll(/\p{Mark}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
