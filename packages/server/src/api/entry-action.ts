// Keep the exact actor and entry names scoped to the checked domain call.
import { name, type Named } from '@gdp-ts/core';
import { CurrentActor, type EntryRef, type UserId } from '@venda/contract';
import { Effect } from 'effect';
import { domainRunner, type DomainServices } from '../infrastructure';

export const forEntry = <A, E>(
  run: Effect.Success<typeof domainRunner>,
  ref: EntryRef,
  action: <U, K>(
    user: Named<U, UserId>,
    entry: Named<K, EntryRef>
  ) => Effect.Effect<A, E, DomainServices>
) =>
  Effect.flatMap(CurrentActor, actor =>
    run(name(actor.userId, ref, (user, entry) => action(user, entry)))
  );
