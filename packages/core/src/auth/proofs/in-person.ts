// Trusted: the only place that can establish that a person, not a script, is acting.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { type Actor, Forbidden, InvalidCredentials, type UserId } from '@venda/contract';
import { eq } from 'drizzle-orm';
import { Effect, Redacted } from 'effect';
import { Database } from '../../database';
import { sameSecret, verifyPassword } from '../crypto';
import { normalizeEmail } from '../rows';
import { Owner } from '../services';
import { users } from '../schema';

const SignedInInPerson = defineProof('SignedInInPerson');

const PasswordConfirmed = defineProof('PasswordConfirmed');

/**
 * `U` is acting through a signed-in session, not an API token, so a leaked
 * token cannot mint more tokens.
 */
export interface SignedInInPerson<U> extends Proof<'SignedInInPerson', [U]> {}

/** `U` has just typed their current password (and is signed in in person). */
export interface PasswordConfirmed<U> extends Proof<'PasswordConfirmed', [U]> {}

export const signedInInPerson = <U>(user: Named<U, UserId>, actor: Actor) => Effect.gen(function*() {
  if (actor.via !== 'session' || actor.userId !== user.value) return yield* new Forbidden({ reason: 'Sign in to do this; API tokens cannot' });

  const proof: SignedInInPerson<U> = SignedInInPerson.prove(user);

  return proof;
});

export const passwordConfirmed = <U>(user: Named<U, UserId>, password: string, _inPerson: SignedInInPerson<U>) => Effect.gen(function*() {
  const db = yield* Database;
  const [row] = yield* db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.value));
  const owner = yield* Owner;
  const recovery = row !== undefined && row.email === normalizeEmail(owner.email) && sameSecret(password, Redacted.value(owner.password));

  const confirmed = recovery || (row?.passwordHash != null && (yield* verifyPassword(password, row.passwordHash)));

  if (!confirmed) return yield* new InvalidCredentials();

  const proof: PasswordConfirmed<U> = PasswordConfirmed.prove(user);

  return proof;
});
