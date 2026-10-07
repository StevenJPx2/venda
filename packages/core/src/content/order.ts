// How a collection's entries are ordered in the admin, by its kind
// (docs/redesign.md): posts read like a blog, drafts first and then the newest
// publish date; pages, singles and records read like a list, A to Z by title.
// The key is stored with each entry, so ascending text order is the order and
// paging can continue from any (key, slug) pair.
import type { CollectionModel, Entry } from '@venda/content';
import { Predicate } from 'effect';

/** Inverts each digit, so a later ISO timestamp sorts first in ascending text order. */
const newestFirst = (iso: string) =>
  iso.replaceAll(/\d/g, digit => String(9 - Number(digit)));

/** `publishedAt` is the entry's date in UTC ISO form, as the index stores it. */
export function sortKey(
  model: CollectionModel,
  entry: Entry,
  publishedAt: string | null
): string {
  if (model.kind === 'posts') {
    if (entry.draft) return '0';

    return publishedAt === null ? '2' : `1${newestFirst(publishedAt)}`;
  }

  const title = model.titleField ? entry.data[model.titleField] : undefined;

  // Untitled entries follow the titled ones, by slug.
  return Predicate.isString(title) && title.trim()
    ? `1${title.trim().toLocaleLowerCase('en')}`
    : '2';
}
