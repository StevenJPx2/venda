// Slug helpers for the editor. Auto-imported by Nuxt.

/** A slug as entry files are named: lowercase words joined by hyphens. */
export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/**
 * Live slug typing: whitespace becomes a hyphen (never doubling one that is
 * already there) and the caret keeps its place. Everything else is left for
 * `slugify` when the field loses focus, so typing never fights the cursor.
 */
export function hyphenateSlug(value: string, caret = value.length): { value: string; caret: number } {
  let out = '';
  let nextCaret = -1;

  for (let i = 0; i < value.length; i++) {
    if (i === caret) nextCaret = out.length;

    const char = value[i]!;
    const afterSpace = /\s/.test(value[i - 1] ?? '');

    if (/\s/.test(char)) {
      if (!out.endsWith('-')) out += '-';
    } else if (!(char === '-' && afterSpace && out.endsWith('-'))) {
      out += char;
    }
  }

  return { value: out, caret: nextCaret < 0 ? out.length : nextCaret };
}
