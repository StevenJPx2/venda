import { Schema } from 'effect';

/** The variables and secrets a Venda server reads, on every platform. */
const ServerEnv = Schema.Struct({
  SESSION_SECRET: Schema.NonEmptyString,
  ADMIN_EMAIL: Schema.NonEmptyString,
  ADMIN_PASSWORD: Schema.NonEmptyString,
  ADMIN_ORIGINS: Schema.optional(Schema.String),
  VENDA_VERSION: Schema.optional(Schema.String),
  // Node only: where SQLite and media files live.
  VENDA_DATA_DIR: Schema.optional(Schema.String)
});

export type ServerEnv = typeof ServerEnv.Type;

/** The environment as the host hands it over (`process.env`), before decoding. */
export type RawEnv = Readonly<Record<string, string | undefined>>;

export const decodeServerEnv = Schema.decodeUnknownSync(ServerEnv);
