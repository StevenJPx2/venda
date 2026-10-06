// Signing in with an email and password, and the recovery owner.
import { InvalidCredentials, TooManyAttempts } from '@venda/contract';
import { eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Redacted, Schema } from 'effect';
import { Database } from '../database';
import { sameSecret, verifyPassword } from './crypto';
import { normalizeEmail, toUser } from './rows';
import { users } from './schema';
import { KeyValue, Owner } from './services';
import { startSession } from './sessions';

// At most 10 failed attempts per email in a sliding 15 minutes.
const MAX_ATTEMPTS = 10;

const WINDOW_SECONDS = 15 * 60;

// Verified against when the email is unknown, so timing does not reveal which emails exist.
const UNKNOWN_USER_HASH = 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

const decodeCount = Schema.decodeUnknownOption(Schema.NumberFromString);

const attemptsKey = (email: string) => `sign-in-attempts:${email}`;

const failedAttempts = (email: string) => Effect.flatMap(KeyValue, kv => Effect.map(kv.get(attemptsKey(email)), stored => Option.getOrElse(Option.flatMap(stored, decodeCount), () => 0)));

const recordFailure = (email: string, failures: number) => Effect.flatMap(KeyValue, kv => kv.set(attemptsKey(email), String(failures + 1), WINDOW_SECONDS));

/** The owner's account, created on first use and always restored to an active administrator. */
const ownerAccount = (email: string) => Effect.gen(function*() {
  const db = yield* Database;
  const [existing] = yield* db.select().from(users).where(eq(users.email, email));

  if (existing !== undefined) {
    const [restored] = yield* db.update(users).set({ role: 'administrator', status: 'active' }).where(eq(users.id, existing.id)).returning();

    return restored ?? existing;
  }

  const [created] = yield* db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    name: 'Owner',
    role: 'administrator',
    status: 'active',
    passwordHash: null,
    sessionEpoch: 0,
    createdAt: DateTime.formatIso(yield* DateTime.now)
  }).returning();

  return yield* Effect.fromNullishOr(created).pipe(Effect.orDie);
});

const isOwner = (email: string, password: string) => Effect.map(Owner, owner => normalizeEmail(owner.email) === email && sameSecret(password, Redacted.value(owner.password)));

const accountFor = (email: string, password: string) => Effect.gen(function*() {
  if (yield* isOwner(email, password)) return Option.some(yield* ownerAccount(email));

  const db = yield* Database;
  const [row] = yield* db.select().from(users).where(eq(users.email, email));
  const matches = yield* verifyPassword(password, row?.passwordHash ?? UNKNOWN_USER_HASH);

  return matches && row?.status === 'active' ? Option.some(row) : Option.none();
});

/** Checks the credentials and starts a session; returns the user and the session secret. */
export const signIn = Effect.fnUntraced(function*(rawEmail: string, password: string) {
  const email = normalizeEmail(rawEmail);
  const failures = yield* failedAttempts(email);

  if (failures >= MAX_ATTEMPTS) return yield* new TooManyAttempts({ retryAfterSeconds: WINDOW_SECONDS });

  const account = yield* accountFor(email, password);

  if (Option.isNone(account)) {
    yield* recordFailure(email, failures);

    return yield* new InvalidCredentials();
  }

  yield* Effect.flatMap(KeyValue, kv => kv.remove(attemptsKey(email)));

  const user = toUser(account.value);

  return { user, secret: yield* startSession(user.id, account.value.sessionEpoch) };
});
