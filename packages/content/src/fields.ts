// The schema each field type's frontmatter value must match.
import { Schema } from 'effect';
import type { Field } from './model';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const IsoDateTime = Schema.String.check(
  Schema.isPattern(DATETIME, {
    expected: 'an ISO date and time, like 2026-10-05T09:30:00Z'
  })
);

const text = (max: number | undefined) =>
  max === undefined
    ? Schema.String
    : Schema.String.check(Schema.isMaxLength(max));

function number(field: Field & { type: 'number' }) {
  const checks = [
    Schema.isFinite(),
    ...(field.min === undefined
      ? []
      : [Schema.isGreaterThanOrEqualTo(field.min)]),
    ...(field.max === undefined ? [] : [Schema.isLessThanOrEqualTo(field.max)])
  ] as const;

  return Schema.Number.check(...checks);
}

/** The schema for a field's value, or undefined for the rich-text body. */
export function fieldSchema(
  field: Field
): Schema.Decoder<Schema.Json> | undefined {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return text(field.max);
    case 'url':
    case 'image':
    case 'relation':
      return Schema.String;
    case 'number':
      return number(field);
    case 'boolean':
      return Schema.Boolean;
    case 'date':
      return Schema.String.check(
        Schema.isPattern(DATE, { expected: 'a date, like 2026-10-05' })
      );
    case 'datetime':
      return IsoDateTime;
    case 'tags':
      return Schema.Array(Schema.String);
    case 'select':
      return Schema.Literals(field.options);
    case 'json':
      return Schema.Json;
    case 'richtext':
      return undefined;
  }
}
