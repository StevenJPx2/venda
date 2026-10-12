// Trusted: every active role may start an entry in a collection; it becomes
// theirs, so the edit and publish proofs then decide what they may do with it.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Unauthenticated, type UserId } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { users } from '../schema';

const CanCreateEntry = defineProof('CanCreateEntry');

export interface CanCreateEntry<U, C> extends Proof<'CanCreateEntry', [U, C]> {}

export const canCreateEntry = <U, C>(
  user: Named<U, UserId>,
  collection: Named<C, string>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, user.value), eq(users.status, 'active')));

    if (row === undefined) return yield* new Unauthenticated();

    const proof: CanCreateEntry<U, C> = CanCreateEntry.prove(user, collection);

    return proof;
  });
