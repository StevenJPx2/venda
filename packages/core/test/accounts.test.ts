import { name } from '@gdp-ts/core';
import {
  type Actor,
  type Role,
  type TokenId,
  type UserId
} from '@venda/contract';
import { Effect, Layer, ManagedRuntime, Redacted, Result } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptInvitation,
  actorFromSession,
  actorFromToken,
  changePassword,
  createInvitation,
  createToken,
  endSession,
  invitationIsOpen,
  isAdministrator,
  KeyValue,
  listUsers,
  Owner,
  ownsToken,
  passwordConfirmed,
  previewInvitation,
  revokeToken,
  signedInInPerson,
  signIn,
  updateUser
} from '../src/auth';
import { Database } from '../src/database';
import { memoryKeyValue, testDatabase } from './support';

const OWNER = { email: 'owner@venda.test', password: 'recovery-secret' };

type Services = Database | KeyValue | Owner;

let runtime: ManagedRuntime.ManagedRuntime<Services, unknown>;

beforeEach(() => {
  runtime = ManagedRuntime.make(
    Layer.mergeAll(
      testDatabase,
      memoryKeyValue,
      Layer.succeed(Owner, {
        email: OWNER.email,
        password: Redacted.make(OWNER.password)
      })
    )
  );
});

afterEach(() => runtime.dispose());

const run = <A, E>(effect: Effect.Effect<A, E, Services>) =>
  runtime.runPromise(effect);

/** The tag an effect fails with, or 'ok'. */
const outcome = async <A, E extends { _tag: string }>(
  effect: Effect.Effect<A, E, Services>
) => {
  const result = await run(Effect.result(effect));

  return Result.isFailure(result) ? result.failure._tag : 'ok';
};

/** Invites, accepts, and signs in a person with this role; returns their session secret and actor. */
async function addPerson(admin: Actor, email: string, role: Role) {
  const created = await run(
    name(admin.userId, actor =>
      Effect.flatMap(isAdministrator(actor), proof =>
        createInvitation(actor, { email, role }, proof)
      )
    )
  );

  await run(
    name(created.token, secret =>
      Effect.flatMap(invitationIsOpen(secret), open =>
        acceptInvitation(
          secret,
          { name: email, password: 'a long password' },
          open
        )
      )
    )
  );

  const { secret } = await run(signIn(email, 'a long password'));

  return { secret, actor: await run(actorFromSession(secret)) };
}

async function signInOwner() {
  const { secret } = await run(signIn(OWNER.email, OWNER.password));

  return { secret, actor: await run(actorFromSession(secret)) };
}

describe('signing in', () => {
  it('lets the recovery owner in as an administrator, and refuses wrong passwords', async () => {
    const { actor } = await signInOwner();

    expect(actor).toMatchObject({ role: 'administrator', via: 'session' });
    expect(await outcome(signIn(OWNER.email, 'wrong'))).toBe(
      'InvalidCredentials'
    );
    expect(await outcome(signIn('nobody@venda.test', 'wrong'))).toBe(
      'InvalidCredentials'
    );
  });

  it('locks an email after ten failures, even for the right password', async () => {
    for (let attempt = 0; attempt < 10; attempt++)
      await outcome(signIn(OWNER.email, 'wrong'));

    expect(await outcome(signIn(OWNER.email, OWNER.password))).toBe(
      'TooManyAttempts'
    );
    expect(await outcome(signIn('other@venda.test', 'wrong'))).toBe(
      'InvalidCredentials'
    );
  });

  it('ends a session on sign-out', async () => {
    const { secret } = await signInOwner();

    await run(endSession(secret));

    expect(await outcome(actorFromSession(secret))).toBe('Unauthenticated');
    expect(await outcome(actorFromSession('made-up'))).toBe('Unauthenticated');
  });
});

describe('administrators: invitations', () => {
  it('invite people, who join once with the link', async () => {
    const { actor: owner } = await signInOwner();
    const created = await run(
      name(owner.userId, actor =>
        Effect.flatMap(isAdministrator(actor), proof =>
          createInvitation(
            actor,
            { email: 'Ann@Venda.test ', role: 'editor' },
            proof
          )
        )
      )
    );
    const preview = await run(
      name(created.token, secret =>
        Effect.flatMap(invitationIsOpen(secret), open =>
          previewInvitation(secret, open)
        )
      )
    );

    expect(preview).toMatchObject({ email: 'ann@venda.test', role: 'editor' });

    const accept = () =>
      run(
        Effect.result(
          name(created.token, secret =>
            Effect.flatMap(invitationIsOpen(secret), open =>
              acceptInvitation(
                secret,
                { name: 'Ann', password: 'a long password' },
                open
              )
            )
          )
        )
      );

    expect(Result.isSuccess(await accept())).toBe(true);
    expect(
      await outcome(
        name(created.token, secret => Effect.asVoid(invitationIsOpen(secret)))
      )
    ).toBe('InvitationNotFound');
    expect(Result.isFailure(await accept())).toBe(true);
    expect(
      (await run(signIn('ann@venda.test', 'a long password'))).user.role
    ).toBe('editor');
  });
});

describe('administrators: checks and changes', () => {
  it('are the only ones who pass the administrator check', async () => {
    const { actor: owner } = await signInOwner();
    const editor = await addPerson(owner, 'ed@venda.test', 'editor');

    expect(
      await outcome(
        name(editor.actor.userId, actor =>
          Effect.asVoid(isAdministrator(actor))
        )
      )
    ).toBe('Forbidden');
    expect(
      await run(
        name(owner.userId, actor =>
          Effect.flatMap(isAdministrator(actor), listUsers)
        )
      )
    ).toHaveLength(2);
  });

  it('end someone’s sessions when their role or status changes', async () => {
    const { actor: owner } = await signInOwner();
    const editor = await addPerson(owner, 'ed@venda.test', 'editor');
    const change = (role: Role) =>
      run(
        name(owner.userId, editor.actor.userId, (actor, target) =>
          Effect.flatMap(isAdministrator(actor), proof =>
            updateUser(target, { role }, proof)
          )
        )
      );

    await change('author');

    expect(await outcome(actorFromSession(editor.secret))).toBe(
      'Unauthenticated'
    );
  });

  it('cannot remove the last active administrator', async () => {
    const { actor: owner } = await signInOwner();
    const demote = (by: Actor, who: UserId) =>
      outcome(
        name(by.userId, who, (actor, target) =>
          Effect.flatMap(isAdministrator(actor), proof =>
            updateUser(target, { role: 'editor' }, proof)
          )
        )
      );

    expect(await demote(owner, owner.userId)).toBe('LastAdministrator');

    const second = await addPerson(owner, 'second@venda.test', 'administrator');

    expect(await demote(second.actor, owner.userId)).toBe('ok');
    expect(await demote(second.actor, second.actor.userId)).toBe(
      'LastAdministrator'
    );
  });
});

describe('passwords', () => {
  it('lets the recovery owner confirm their configured password and choose a personal password', async () => {
    const { actor, secret } = await signInOwner();
    const fresh = await run(
      name(actor.userId, user =>
        Effect.gen(function* () {
          const inPerson = yield* signedInInPerson(user, actor);
          const proof = yield* passwordConfirmed(
            user,
            OWNER.password,
            inPerson
          );

          return yield* changePassword(
            user,
            'a personal owner password',
            proof
          );
        })
      )
    );

    expect(await outcome(actorFromSession(secret))).toBe('Unauthenticated');
    expect((await run(actorFromSession(fresh))).userId).toBe(actor.userId);
    expect(
      (await run(signIn(OWNER.email, 'a personal owner password'))).user.id
    ).toBe(actor.userId);
    expect((await run(signIn(OWNER.email, OWNER.password))).user.id).toBe(
      actor.userId
    );
  });

  it('change a password only after confirming the current one, ending other sessions', async () => {
    const { actor: owner } = await signInOwner();
    const ann = await addPerson(owner, 'ann@venda.test', 'author');

    const change = (current: string) =>
      run(
        Effect.result(
          name(ann.actor.userId, user =>
            Effect.gen(function* () {
              const inPerson = yield* signedInInPerson(user, ann.actor);
              const confirmed = yield* passwordConfirmed(
                user,
                current,
                inPerson
              );

              return yield* changePassword(
                user,
                'an even longer password',
                confirmed
              );
            })
          )
        )
      );

    expect(Result.isFailure(await change('wrong'))).toBe(true);

    const changed = await change('a long password');

    expect(Result.isSuccess(changed)).toBe(true);
    expect(await outcome(actorFromSession(ann.secret))).toBe('Unauthenticated');
    expect(
      Result.isSuccess(changed) &&
        (await run(actorFromSession(changed.success))).userId
    ).toBe(ann.actor.userId);
  });
});

describe('tokens', () => {
  it('are made in person, act as their owner, and are revoked only by them', async () => {
    const { actor: owner } = await signInOwner();
    const ann = await addPerson(owner, 'ann@venda.test', 'author');
    const make = (actor: Actor) =>
      name(actor.userId, user =>
        Effect.flatMap(signedInInPerson(user, actor), proof =>
          createToken(user, 'CI', proof)
        )
      );
    const created = await run(make(ann.actor));
    const viaToken = await run(actorFromToken(created.secret));

    expect(viaToken).toMatchObject({
      userId: ann.actor.userId,
      role: 'author',
      via: 'token'
    });
    expect(await outcome(make(viaToken))).toBe('Forbidden');

    const revoke = (actor: Actor, id: TokenId) =>
      outcome(
        name(actor.userId, id, (user, token) =>
          Effect.flatMap(ownsToken(user, token), proof =>
            revokeToken(token, proof)
          )
        )
      );

    expect(await revoke(owner, created.token.id)).toBe('TokenNotFound');
    expect(await revoke(ann.actor, created.token.id)).toBe('ok');
    expect(await outcome(actorFromToken(created.secret))).toBe(
      'Unauthenticated'
    );
  });
});
