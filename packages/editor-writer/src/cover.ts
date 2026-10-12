import type { CollectionSummary } from '@venda/contract';

/** The field shown as the feature image above the title: the first image field. */
export const coverFieldOf = (collection: CollectionSummary): string | null =>
  collection.fields.find(field => field.type === 'image')?.key ?? null;

/** An address someone typed, ready to save: trimmed, and null when empty. */
export const coverAddress = (typed: string): string | null =>
  typed.trim() || null;
