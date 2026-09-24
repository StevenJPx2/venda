// Pure helpers shared by the collection page and the editor. Auto-imported by Nuxt.
import { isEmptyValue, type CollectionSchema } from '@venda/schema';

/** Mirrors the API's slug rules so the editor previews exactly what gets saved. */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function wordCount(html: string): number {
  const text = plainText(html);
  return text ? text.split(' ').length : 0;
}

/** The editor keeps an empty trailing paragraph for the cursor; don't persist it. */
export function trimTrailingEmpty(html: string): string {
  return html.replace(/(?:<p>(?:\s|&nbsp;|<br[^>]*>)*<\/p>\s*)+$/i, '');
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
    if (field.interface === 'wysiwyg' && typeof value === 'string') value = trimTrailingEmpty(value);
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
