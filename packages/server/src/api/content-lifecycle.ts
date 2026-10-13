import { name } from '@gdp-ts/core';
import { CurrentActor, VendaApi } from '@venda/contract';
import { canBrowseContent, canPublishEntry } from '@venda/core/auth';
import {
  listTrash,
  restoreEntry,
  setEntryVisibility,
  trashEntry
} from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner } from '../infrastructure';
import { forEntry } from './entry-action';

export const ContentLifecycleHandlers = HttpApiBuilder.group(
  VendaApi,
  'contentLifecycle',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      unpublish: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canPublishEntry(user, entry), proof =>
            setEntryVisibility(user, entry, payload, 'draft', proof)
          )
        ),
      republish: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canPublishEntry(user, entry), proof =>
            setEntryVisibility(user, entry, payload, 'published', proof)
          )
        ),
      trash: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canPublishEntry(user, entry), proof =>
            trashEntry(user, entry, payload, proof)
          )
        ),
      restore: ({ params, payload }) =>
        forEntry(run, params, (user, entry) =>
          Effect.flatMap(canPublishEntry(user, entry), proof =>
            restoreEntry(user, entry, payload.revision, proof)
          )
        ),
      listTrash: ({ query }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(canBrowseContent(user), proof =>
                listTrash(user, query.cursor, proof)
              )
            )
          )
        )
    });
  })
);
