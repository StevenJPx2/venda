// What every field input shares: its props, and turning an entry's stored
// value into what an input shows and back. An emptied input unsets its field,
// so an optional value left blank stays out of the file.
import type { FieldValue } from '@venda/admin';
import type { CollectionField } from '@venda/contract';
import { Option, Predicate, Schema } from 'effect';

export interface FieldProps {
  field: CollectionField;
  modelValue: FieldValue | null;
  readonly: boolean;
}

export const textOf = (value: FieldValue | null) =>
  Predicate.isString(value) ? value : '';

export const textValue = (text: string): string | null =>
  text === '' ? null : text;

export const tagsOf = (value: FieldValue | null): string[] =>
  Array.isArray(value) ? value.filter(Predicate.isString) : [];

/** A typed number, or null when the input is empty or not a number. */
export function numberValue(text: string | number): number | null {
  const value = Predicate.isNumber(text) ? text : Number(text);

  return text === '' || !Number.isFinite(value) ? null : value;
}

/** JSON text for the input. */
export const jsonText = (value: FieldValue | null) =>
  value === null ? '' : JSON.stringify(value, null, 2);

const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

/** The value JSON text holds: null when blank, undefined when it is not JSON. */
export const jsonValue = (text: string): FieldValue | null | undefined =>
  text.trim() === '' ? null : Option.getOrUndefined(decodeJson(text));
