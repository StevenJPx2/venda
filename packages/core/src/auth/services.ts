// What accounts need from the host besides the database.
import { Context, type Effect, type Option, type Redacted, Schema } from 'effect';

export class KeyValueError extends Schema.TaggedError<KeyValueError>()('KeyValueError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/** Short-lived strings with an expiry: sessions and sign-in attempts (KV on Workers). */
export class KeyValue extends Context.Service<KeyValue, {
  readonly get: (key: string) => Effect.Effect<Option.Option<string>, KeyValueError>;
  readonly set: (key: string, value: string, ttlSeconds: number) => Effect.Effect<void, KeyValueError>;
  readonly remove: (key: string) => Effect.Effect<void, KeyValueError>;
}>()('venda/core/auth/KeyValue') {}

/**
 * The recovery owner from the install's secrets: signing in with this email
 * and password always works, as an active administrator, so access can be
 * recovered by rotating the secret.
 */
export class Owner extends Context.Service<Owner, {
  readonly email: string;
  readonly password: Redacted.Redacted;
}>()('venda/core/auth/Owner') {}
