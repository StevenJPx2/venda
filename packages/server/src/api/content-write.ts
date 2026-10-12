import { name, type Named } from '@gdp-ts/core';
import {
  CurrentActor,
  VendaApi,
  type EntryRef,
  type UserId
} from '@venda/contract';
import {
  canAssignOwner,
  canEditEntry,
  canPublishEntry
} from '@venda/core/auth';
import {
  assignEntryOwner,
  discardWorkingCopy,
  getWorkingCopy,
  publishWorkingCopy,
  rebaseWorkingCopy,
  saveWorkingCopy
} from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner, type DomainServices } from '../infrastructure';

const forEntry = <A, E>(
  run: Effect.Success<typeof domainRunner>,
  ref: EntryRef,
  action: <U, K>(
    user: Named<U, UserId>,
    entry: Named<K, EntryRef>
  ) => Effect.Effect<A, E, DomainServices>
) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;

    return yield* run(
      name(actor.userId, ref, (user, entry) => action(user, entry))
    );
  });

export const ContentWriteHandlers = HttpApiBuilder.group(
  VendaApi,
  'contentWrite',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      copy: ({ params }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canEditEntry(user, entry), proof =>
            getWorkingCopy(user, entry, proof)
          )
        ),
      save: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canEditEntry(user, entry), proof =>
            saveWorkingCopy(user, entry, payload, proof)
          )
        ),
      discard: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canEditEntry(user, entry), proof =>
            discardWorkingCopy(user, entry, payload.revision, proof)
          )
        ),
      publish: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canPublishEntry(user, entry), proof =>
            publishWorkingCopy(user, entry, payload.revision, proof)
          )
        ),
      rebase: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canEditEntry(user, entry), proof =>
            rebaseWorkingCopy(user, entry, payload.revision, payload.sha, proof)
          )
        ),
      owner: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canAssignOwner(user, entry), proof =>
            assignEntryOwner(
              user,
              entry,
              payload.revision,
              payload.ownerId,
              proof
            )
          )
        )
    });
  })
);
