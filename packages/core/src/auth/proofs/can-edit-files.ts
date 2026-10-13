// Trusted: the only place that can establish that someone may read and write
// the content files directly (the files API and the CLI): administrators and
// editors, who may already edit every entry, model and setting.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Forbidden, type UserId } from '@venda/contract';
import { and, eq, inArray } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { users } from '../schema';

const CanEditFiles = defineProof('CanEditFiles');

/** `A` is an active administrator or editor, read from the database at the time of the check. */
export interface CanEditFiles<A> extends Proof<'CanEditFiles', [A]> {}

export const canEditFiles = <A>(actor: Named<A, UserId>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, actor.value),
          inArray(users.role, ['administrator', 'editor']),
          eq(users.status, 'active')
        )
      );

    if (row === undefined)
      return yield* new Forbidden({
        reason: 'Only administrators and editors can change the content files'
      });

    const proof: CanEditFiles<A> = CanEditFiles.prove(actor);

    return proof;
  });
