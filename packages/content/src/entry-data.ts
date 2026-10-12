// Validate editor JSON before it reaches Markdown serialization. Missing fields
// are allowed while saving; readEntry checks required fields on publication.
import { isRichTextDoc } from '@venda/richtext';
import { Result, Schema } from 'effect';
import { fieldSchema, IsoDateTime } from './fields';
import type { Json } from './literal';
import type { CollectionModel, Field } from './model';

const decodeDate = Schema.decodeUnknownResult(Schema.NullOr(IsoDateTime));

/** The problem with one field's value, or undefined when it fits. */
function fieldProblem(key: string, field: Field, value: Json) {
  if (field.type === 'richtext')
    return isRichTextDoc(value)
      ? undefined
      : `${key} must be a rich-text document`;

  const decoder = fieldSchema(field);
  const checked = decoder && Schema.decodeUnknownResult(decoder)(value);

  return checked && Result.isFailure(checked)
    ? `${key}: ${checked.failure.message}`
    : undefined;
}

export function checkEntryData(
  model: CollectionModel,
  data: Readonly<Record<string, Json>>,
  publishedAt: string | null
): Result.Result<void, string> {
  const date = decodeDate(publishedAt);

  if (Result.isFailure(date)) return Result.fail(date.failure.message);

  for (const [key, value] of Object.entries(data)) {
    const field = Object.hasOwn(model.fields, key)
      ? model.fields[key]
      : undefined;
    const problem = field
      ? value !== null && fieldProblem(key, field, value)
      : `Unknown field "${key}"`;

    if (problem) return Result.fail(problem);
  }

  return Result.succeed(undefined);
}
