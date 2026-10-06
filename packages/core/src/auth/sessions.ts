// Sessions in the key-value store, keyed by the SHA-256 of their secret. Each
// records the user's session epoch when it began; raising the epoch (password,
// role or status change) ends every session at once, with no list to keep.
import { Actor, type UserId, Unauthenticated } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';
import { Database } from '../database';
import { digest, randomSecret } from './crypto';
import { asUserId } from './rows';
import { apiTokens, users } from './schema';
import { KeyValue } from './services';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const SessionRecord = Schema.Struct({
  userId: Schema.String,
  epoch: Schema.Number
});

const decodeRecord = Schema.decodeUnknownOption(
  Schema.fromJsonString(SessionRecord)
);

const sessionKey = (secret: string) =>
  Effect.map(digest(secret), hash => `session:${hash}`);

/** Starts a session for a user and returns its secret, for the cookie. */
export const startSession = (userId: UserId, epoch: number) =>
  Effect.gen(function* () {
    const kv = yield* KeyValue;
    const secret = yield* randomSecret;

    yield* kv.set(
      yield* sessionKey(secret),
      JSON.stringify({ userId, epoch }),
      SESSION_TTL_SECONDS
    );

    return secret;
  });

export const endSession = (secret: string) =>
  Effect.flatMap(KeyValue, kv =>
    Effect.flatMap(sessionKey(secret), key => kv.remove(key))
  );

// The user as they are now: a disabled user or a changed epoch ends the credential.
const activeUser = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const active = and(eq(users.id, userId), eq(users.status, 'active'));
    const [row] = yield* db
      .select({ id: users.id, role: users.role, epoch: users.sessionEpoch })
      .from(users)
      .where(active);

    return Option.fromNullishOr(row);
  });

/** Who a session cookie belongs to, if it is live. */
export const actorFromSession = (secret: string) =>
  Effect.gen(function* () {
    const kv = yield* KeyValue;
    const record = Option.flatMap(
      yield* kv.get(yield* sessionKey(secret)),
      decodeRecord
    );

    if (Option.isNone(record)) return yield* new Unauthenticated();

    const user = yield* activeUser(record.value.userId);

    if (Option.isNone(user) || user.value.epoch !== record.value.epoch)
      return yield* new Unauthenticated();

    return new Actor({
      userId: asUserId(user.value.id),
      role: user.value.role,
      via: 'session'
    });
  });

/** Who an API token belongs to, if it is live; records when it was last used. */
export const actorFromToken = (secret: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [token] = yield* db
      .select({ id: apiTokens.id, userId: apiTokens.userId })
      .from(apiTokens)
      .where(eq(apiTokens.secretHash, yield* digest(secret)));

    if (token === undefined) return yield* new Unauthenticated();

    const user = yield* activeUser(token.userId);

    if (Option.isNone(user)) return yield* new Unauthenticated();

    yield* db
      .update(apiTokens)
      .set({ lastUsedAt: DateTime.formatIso(yield* DateTime.now) })
      .where(eq(apiTokens.id, token.id));

    return new Actor({
      userId: asUserId(user.value.id),
      role: user.value.role,
      via: 'token'
    });
  });
