import { Schema } from 'effect';

/** The variables and secrets a Venda server reads, on every runtime. */
const ServerEnv = Schema.Struct({
  VENDA_VERSION: Schema.optional(Schema.String),
  // The recovery owner: always signs in as an administrator (rotate to recover access).
  VENDA_OWNER_EMAIL: Schema.NonEmptyString,
  VENDA_OWNER_PASSWORD: Schema.String.pipe(
    Schema.check(Schema.isMinLength(12, { expected: 'at least 12 characters' }))
  ),
  // Local development: read content from this folder server (scripts/content-server.mjs)
  // instead of the copy built into the Worker, and re-index whenever it changes.
  VENDA_CONTENT_URL: Schema.optional(Schema.URLFromString)
});

/** The environment as the host hands it over (`process.env`), before decoding. */
export type RawEnv = Readonly<Record<string, string | undefined>>;

export const decodeServerEnv = Schema.decodeUnknownSync(ServerEnv);
