import type { FieldValue } from '@venda/admin';

/** A field's text, or null when it holds something else or nothing. */
export function textOf(value: FieldValue | null | undefined): string | null {
  // FieldValue is JSON, so its only strings are primitives, which box to String.
  return Object(value) instanceof String ? String(value) : null;
}
