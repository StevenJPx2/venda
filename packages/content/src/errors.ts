import { Schema } from 'effect';

/** A collection's `config.ts` or the site's `site.ts` that does not hold valid settings. */
export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()(
  'InvalidConfig',
  {
    path: Schema.String,
    message: Schema.String,
    line: Schema.optional(Schema.Number)
  }
) {}

/** An entry file that does not fit its collection's model. */
export class InvalidEntry extends Schema.TaggedError<InvalidEntry>()(
  'InvalidEntry',
  {
    path: Schema.String,
    message: Schema.String,
    line: Schema.optional(Schema.Number)
  }
) {}
