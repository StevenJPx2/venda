// People, invitations and API tokens. Every operation that only some callers
// may perform demands the proof of its precondition (proofs/), so code that
// skips the check does not compile.
import type { Named } from '@gdp-ts/core';
import { CreatedInvitation, CreatedToken, EmailTaken, InvitationNotFound, InvitationPreview, type InvitationId, LastAdministrator, type Role, type TokenId, Unauthenticated, type UserId, UserNotFound } from '@venda/contract';
import { and, asc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { DateTime, Duration, Effect } from 'effect';
import { Database } from '../database';
import { digest, hashPassword, randomSecret } from './crypto';
import type { InvitationIsOpen } from './proofs/invitation-is-open';
import type { IsAdministrator } from './proofs/is-administrator';
import type { PasswordConfirmed, SignedInInPerson } from './proofs/in-person';
import type { OwnsToken } from './proofs/owns-token';
import { asUserId, normalizeEmail, toInvitation, toToken, toUser } from './rows';
import { apiTokens, invitations, users } from './schema';
import { startSession } from './sessions';

const INVITATION_LIFETIME = Duration.days(7);

const now = Effect.map(DateTime.now, DateTime.formatIso);

/** The signed-in person's own account. */
export const me = <U>(user: Named<U, UserId>) => Effect.gen(function*() {
  const db = yield* Database;
  const [row] = yield* db.select().from(users).where(eq(users.id, user.value));

  if (row === undefined) return yield* new Unauthenticated();

  return toUser(row);
});

export const listUsers = <A>(_admin: IsAdministrator<A>) => Effect.gen(function*() {
  const db = yield* Database;

  return (yield* db.select().from(users).orderBy(asc(users.email))).map(toUser);
});

export interface UserChange {
  readonly role?: Role | undefined;
  readonly status?: 'active' | 'disabled' | undefined;
  readonly name?: string | undefined;
}

// True for the target row unless it is the last active administrator.
const anotherAdministratorRemains = (target: string) => or(
  ne(users.role, 'administrator'),
  ne(users.status, 'active'),
  gt(sql`(SELECT count(*) FROM users WHERE role = 'administrator' AND status = 'active' AND id <> ${target})`, 0)
);

/**
 * Changes someone's role, status or name. A role or status change ends their
 * sessions. One statement both checks and applies "an administrator remains",
 * so two administrators demoting each other at once cannot leave none.
 */
export const updateUser = <A, T>(target: Named<T, UserId>, change: UserChange, _admin: IsAdministrator<A>) => Effect.gen(function*() {
  const db = yield* Database;
  const demotes = (change.role !== undefined && change.role !== 'administrator') || change.status === 'disabled';
  const endsSessions = change.role !== undefined || change.status !== undefined;
  const values = { ...change, sessionEpoch: endsSessions ? sql`${users.sessionEpoch} + 1` : users.sessionEpoch };
  const guard = demotes ? and(eq(users.id, target.value), anotherAdministratorRemains(target.value)) : eq(users.id, target.value);
  const [updated] = yield* db.update(users).set(values).where(guard).returning();

  if (updated !== undefined) return toUser(updated);

  const [exists] = yield* db.select({ id: users.id }).from(users).where(eq(users.id, target.value));

  return yield* (exists === undefined ? new UserNotFound() : new LastAdministrator());
});

export const listInvitations = <A>(_admin: IsAdministrator<A>) => Effect.gen(function*() {
  const db = yield* Database;
  const open = and(isNull(invitations.acceptedAt), gt(invitations.expiresAt, yield* now));

  return (yield* db.select().from(invitations).where(open).orderBy(asc(invitations.expiresAt))).map(toInvitation);
});

/** Invites someone; the returned token is the join link's secret, and is stored only as its hash. */
export const createInvitation = <A>(actor: Named<A, UserId>, request: { email: string; role: Role }, _admin: IsAdministrator<A>) => Effect.gen(function*() {
  const db = yield* Database;
  const email = normalizeEmail(request.email);
  const [taken] = yield* db.select({ id: users.id }).from(users).where(eq(users.email, email));

  if (taken !== undefined) return yield* new EmailTaken();

  const token = yield* randomSecret;
  const expiresAt = DateTime.formatIso(DateTime.addDuration(yield* DateTime.now, INVITATION_LIFETIME));
  const [row] = yield* db.insert(invitations).values({ id: crypto.randomUUID(), email, role: request.role, tokenHash: yield* digest(token), invitedBy: actor.value, expiresAt }).returning();
  const invitation = toInvitation(yield* Effect.orDie(Effect.fromNullishOr(row)));

  return new CreatedInvitation({ invitation, token });
});

export const revokeInvitation = <A>(id: InvitationId, _admin: IsAdministrator<A>) => Effect.gen(function*() {
  const db = yield* Database;
  const [removed] = yield* db.delete(invitations).where(and(eq(invitations.id, id), isNull(invitations.acceptedAt))).returning({ id: invitations.id });

  if (removed === undefined) return yield* new InvitationNotFound();
});

export const previewInvitation = <I>(secret: Named<I, string>, _open: InvitationIsOpen<I>) => Effect.gen(function*() {
  const db = yield* Database;
  const [row] = yield* db.select().from(invitations).where(eq(invitations.tokenHash, yield* digest(secret.value)));

  if (row === undefined) return yield* new InvitationNotFound();

  return new InvitationPreview({ email: row.email, role: row.role });
});

/**
 * Creates the invited person's account. The invitation is claimed by an
 * update that re-checks it is open, so a link works once even under races.
 */
export const acceptInvitation = <I>(secret: Named<I, string>, account: { name: string; password: string }, _open: InvitationIsOpen<I>) => Effect.gen(function*() {
  const db = yield* Database;
  const at = yield* now;
  const open = and(eq(invitations.tokenHash, yield* digest(secret.value)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, at));
  const [claimed] = yield* db.update(invitations).set({ acceptedAt: at }).where(open).returning();

  if (claimed === undefined) return yield* new InvitationNotFound();

  const [taken] = yield* db.select({ id: users.id }).from(users).where(eq(users.email, claimed.email));

  if (taken !== undefined) return yield* new EmailTaken();

  const row = { id: crypto.randomUUID(), email: claimed.email, name: account.name.trim(), role: claimed.role, status: 'active' as const, passwordHash: yield* hashPassword(account.password), sessionEpoch: 0, createdAt: at };

  yield* db.insert(users).values(row);

  return toUser(row);
});

/** Sets a new password, ends every session, and starts a fresh one for the person who changed it. */
export const changePassword = <U>(user: Named<U, UserId>, next: string, _confirmed: PasswordConfirmed<U>) => Effect.gen(function*() {
  const db = yield* Database;
  const [row] = yield* db.update(users).set({ passwordHash: yield* hashPassword(next), sessionEpoch: sql`${users.sessionEpoch} + 1` }).where(eq(users.id, user.value)).returning();
  const updated = yield* Effect.orDie(Effect.fromNullishOr(row));

  return yield* startSession(asUserId(updated.id), updated.sessionEpoch);
});

export const listTokens = <U>(user: Named<U, UserId>) => Effect.gen(function*() {
  const db = yield* Database;

  return (yield* db.select().from(apiTokens).where(eq(apiTokens.userId, user.value)).orderBy(asc(apiTokens.createdAt))).map(toToken);
});

/** Creates an API token acting as this person; the secret is returned once and stored only as its hash. */
export const createToken = <U>(user: Named<U, UserId>, name: string, _inPerson: SignedInInPerson<U>) => Effect.gen(function*() {
  const db = yield* Database;
  const secret = yield* randomSecret;
  const [row] = yield* db.insert(apiTokens).values({ id: crypto.randomUUID(), userId: user.value, name: name.trim(), secretHash: yield* digest(secret), createdAt: yield* now, lastUsedAt: null }).returning();

  return new CreatedToken({ token: toToken(yield* Effect.orDie(Effect.fromNullishOr(row))), secret });
});

export const revokeToken = <U, K>(token: Named<K, TokenId>, _owns: OwnsToken<U, K>) => Effect.flatMap(Database, db => Effect.asVoid(db.delete(apiTokens).where(eq(apiTokens.id, token.value))));
