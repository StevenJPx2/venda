import { Schema } from 'effect';

/** The variables a Venda server reads, on every runtime. */
const ServerEnv = Schema.Struct({
  VENDA_VERSION: Schema.optional(Schema.String)
});

/** The environment as the host hands it over (`process.env`), before decoding. */
export type RawEnv = Readonly<Record<string, string | undefined>>;

export const decodeServerEnv = Schema.decodeUnknownSync(ServerEnv);
