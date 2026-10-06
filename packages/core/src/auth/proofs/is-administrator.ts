// Trusted: the only place that can establish that someone is an administrator.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Forbidden, type UserId } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { users } from '../schema';

const IsAdministrator = defineProof('IsAdministrator');

/** `A` is an active administrator, read from the database at the time of the check (not from their session). */
export interface IsAdministrator<A> extends Proof<'IsAdministrator', [A]> {}

export const isAdministrator = <A>(actor: Named<A, UserId>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const activeAdministrator = and(
      eq(users.id, actor.value),
      eq(users.role, 'administrator'),
      eq(users.status, 'active')
    );
    const [row] = yield* db
      .select({ id: users.id })
      .from(users)
      .where(activeAdministrator);

    if (row === undefined)
      return yield* new Forbidden({
        reason: 'Only administrators can do this'
      });

    const proof: IsAdministrator<A> = IsAdministrator.prove(actor);

    return proof;
  });
