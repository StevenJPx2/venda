import { name, type Named } from '@gdp-ts/core';
import { CurrentActor, VendaApi, type UserId } from '@venda/contract';
import {
  canAssignOwner,
  canCreateEntry,
  canEditEntry,
  canPublishEntry,
  isAdministrator,
  type IsAdministrator
} from '@venda/core/auth';
import {
  assignEntryOwner,
  createEntry,
  discardWorkingCopy,
  getSiteDocument,
  getWorkingCopy,
  publishWorkingCopy,
  rebaseWorkingCopy,
  saveSiteFile,
  saveWorkingCopy,
  type CreateInput
} from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner, type DomainServices } from '../infrastructure';
import { forEntry } from './entry-action';

type Run = Effect.Success<typeof domainRunner>;

/** Creates the entry, then reads it back as its new owner, through the edit proof. */
const create = (run: Run, collection: string, input: CreateInput) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;
    const ref = yield* run(
      name(actor.userId, collection, (user, named) =>
        Effect.flatMap(canCreateEntry(user, named), proof =>
          createEntry(user, named, input, proof)
        )
      )
    );

    return yield* forEntry(run, ref, (user, entry) =>
      Effect.flatMap(canEditEntry(user, entry), proof =>
        getWorkingCopy(user, entry, proof)
      )
    );
  });

const asAdministrator = <A, E>(
  run: Run,
  action: <U>(
    user: Named<U, UserId>,
    admin: IsAdministrator<U>
  ) => Effect.Effect<A, E, DomainServices>
) =>
  Effect.flatMap(CurrentActor, actor =>
    run(
      name(actor.userId, user =>
        Effect.flatMap(isAdministrator(user), proof => action(user, proof))
      )
    )
  );

export const ContentWriteHandlers = HttpApiBuilder.group(
  VendaApi,
  'contentWrite',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      create: ({ params, payload }) => create(run, params.collection, payload),
      site: () =>
        asAdministrator(run, (_user, proof) => getSiteDocument(proof)),
      saveSite: ({ payload }) =>
        asAdministrator(run, (user, admin) =>
          saveSiteFile(user, payload, admin)
        ),
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
