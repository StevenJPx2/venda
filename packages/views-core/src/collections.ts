// How collections are grouped wherever they are listed (docs/redesign.md):
// writing first (posts, then pages), then one-of-a-kind content, then
// structured records; A to Z by name within each group.
import type { AdminRuntime, NavItem } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';

type Kind = CollectionSummary['kind'];

const RANK: Record<Kind, number> = {
  posts: 0,
  pages: 1,
  single: 2,
  records: 3
};

const GROUP: Record<Kind, string> = {
  posts: 'writing',
  pages: 'writing',
  single: 'single',
  records: 'records'
};

export const KIND_ICON: Record<Kind, string> = {
  posts: 'i-lucide-pen-line',
  pages: 'i-lucide-file-text',
  single: 'i-lucide-file',
  records: 'i-lucide-table-2'
};

/**
 * A collection screen's heading: its own name and description from its
 * config.ts. Before the models load, and with no description, nothing is made up.
 */
export const collectionHeading = (
  collection: CollectionSummary | undefined
) => ({
  title: collection?.name ?? 'Content',
  back: { to: '/content', label: 'Content' },
  description: collection?.description ?? undefined
});

export const byKind = (collections: ReadonlyArray<CollectionSummary>) =>
  [...collections].sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  );

/** The sidebar's links under Content: one per collection, grouped by kind. */
export async function collectionLinks(
  admin: AdminRuntime
): Promise<ReadonlyArray<NavItem>> {
  const collections = await admin.request(admin.api.adminContent.collections());

  return byKind(collections).map(collection => ({
    label: collection.name,
    icon: KIND_ICON[collection.kind],
    to: `/content/${encodeURIComponent(collection.slug)}`,
    group: GROUP[collection.kind]
  }));
}
