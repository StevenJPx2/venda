import { name } from '@gdp-ts/core';
import { CurrentActor, VendaApi } from '@venda/contract';
import { canBrowseContent, isAdministrator } from '@venda/core/auth';
import { getIndexedEntry, listCollections, listContentProblems, listIndexedEntries } from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner } from '../infrastructure';

export const AdminContentHandlers = HttpApiBuilder.group(VendaApi, 'adminContent', Effect.fn(function*(handlers) {
  const run = yield* domainRunner;

  return handlers.handleAll({
    collections: () => Effect.flatMap(CurrentActor, actor => run(name(actor.userId, user => Effect.flatMap(canBrowseContent(user), listCollections)))),
    entries: ({ params, query }) => Effect.flatMap(CurrentActor, actor => run(name(actor.userId, user => Effect.flatMap(canBrowseContent(user), proof => listIndexedEntries(user, params.collection, query, proof))))),
    problems: () => Effect.flatMap(CurrentActor, actor => run(name(actor.userId, user => Effect.flatMap(isAdministrator(user), listContentProblems)))),
    entry: ({ params }) => Effect.flatMap(CurrentActor, actor => run(name(actor.userId, user => Effect.flatMap(canBrowseContent(user), proof => getIndexedEntry(user, params.collection, params.slug, proof)))))
  });
}));
