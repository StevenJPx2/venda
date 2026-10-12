// Trusted: ownership assignment belongs to editors and administrators.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Forbidden, type EntryRef, type UserId } from '@venda/contract';
import { Effect } from 'effect';
import { entryAccess } from './entry-access';

const CanAssignOwner = defineProof('CanAssignOwner');

export interface CanAssignOwner<U, E> extends Proof<'CanAssignOwner', [U, E]> {}

export const canAssignOwner = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>
) =>
  Effect.gen(function* () {
    const access = yield* entryAccess(user, entry);

    if (!access.editor)
      return yield* new Forbidden({
        reason: 'Only editors can assign entry owners'
      });

    const proof: CanAssignOwner<U, E> = CanAssignOwner.prove(user, entry);

    return proof;
  });
