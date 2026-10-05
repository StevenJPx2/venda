import { Schema } from 'effect';

/** A `config.ts` that is not a valid collection model. */
export class InvalidCollectionConfig extends Schema.TaggedError<InvalidCollectionConfig>()('InvalidCollectionConfig', {
  path: Schema.String,
  message: Schema.String,
  line: Schema.optional(Schema.Number)
}) {}

/** An entry file that does not fit its collection's model. */
export class InvalidEntry extends Schema.TaggedError<InvalidEntry>()('InvalidEntry', {
  path: Schema.String,
  message: Schema.String,
  line: Schema.optional(Schema.Number)
}) {}
