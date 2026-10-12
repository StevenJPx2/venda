// Trusted: binds the editor or owner's permission to the exact entry.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Forbidden, type EntryRef, type UserId } from '@venda/contract';
import { Effect } from 'effect';
import { entryAccess } from './entry-access';

const CanEditEntry = defineProof('CanEditEntry');

export interface CanEditEntry<U, E> extends Proof<'CanEditEntry', [U, E]> {}

export const canEditEntry = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>
) =>
  Effect.gen(function* () {
    const access = yield* entryAccess(user, entry);

    if (!access.editor && !access.owns)
      return yield* new Forbidden({
        reason: 'Only editors or the entry’s owner can edit this entry'
      });

    const proof: CanEditEntry<U, E> = CanEditEntry.prove(user, entry);

    return proof;
  });
