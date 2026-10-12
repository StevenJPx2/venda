// Trusted: contributors save for review; only editors and owning authors publish.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Forbidden, type EntryRef, type UserId } from '@venda/contract';
import { Effect } from 'effect';
import { entryAccess } from './entry-access';

const CanPublishEntry = defineProof('CanPublishEntry');

export interface CanPublishEntry<U, E> extends Proof<
  'CanPublishEntry',
  [U, E]
> {}

export const canPublishEntry = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>
) =>
  Effect.gen(function* () {
    const access = yield* entryAccess(user, entry);

    if (access.contributor || (!access.editor && !access.owns))
      return yield* new Forbidden({
        reason: 'Only editors or an author who owns the entry can publish it'
      });

    const proof: CanPublishEntry<U, E> = CanPublishEntry.prove(user, entry);

    return proof;
  });
