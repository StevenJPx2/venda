// Pure helpers shared by the collection page and the editor. Auto-imported by Nuxt.
import { toDoc, toPlainText, trimTrailingEmpty } from '@venda/richtext';
import { isEmptyValue, type CollectionSchema } from '@venda/schema';

/** Mirrors the API's slug rules so the editor previews exactly what gets saved. */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/** A rich-text value (document or legacy HTML) as one line of plain text, for previews. */
export function richTextPreview(value: unknown): string {
  return toPlainText(toDoc(value)).replace(/\s+/g, ' ').trim();
}

/**
 * Normalises entry data before saving: rich text loses trailing empty
 * paragraphs and empty values are dropped rather than stored blank. Keys the
 * schema does not define are preserved untouched.
 */
export function cleanEntryData(schema: CollectionSchema, data: Record<string, unknown>): Record<string, unknown> {
  const fields = new Map(schema.fields.map(field => [field.key, field]));

  return Object.fromEntries(Object.entries(data).flatMap(([key, raw]) => {
    const field = fields.get(key);
    if (!field) return [[key, raw]];

    let value = raw;
    // The editor keeps an empty trailing paragraph for the cursor; don't persist it.
    if (field.interface === 'wysiwyg' && value !== undefined && value !== null) value = trimTrailingEmpty(toDoc(value));
    else if (typeof value === 'string' && field.interface !== 'code') value = value.trim();

    return isEmptyValue(field, value) ? [] : [[key, value]];
  }));
}

/** Readable name for an entry: its title field, else its slug. */
export function entryTitle(schema: CollectionSchema, entry: { slug: string; data: Record<string, unknown> }): string {
  const value = schema.titleField ? entry.data[schema.titleField] : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : entry.slug;
}

/** Next slug to try after a uniqueness conflict: `post` → `post-2` → `post-3`. */
export function nextSlug(slug: string): string {
  const match = slug.match(/^(.*)-(\d+)$/);
  return match ? `${match[1]}-${Number(match[2]) + 1}` : `${slug}-2`;
}
