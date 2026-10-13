import { name } from '@gdp-ts/core';
import {
  ContentFile,
  CurrentActor,
  FileNotFound,
  FilesImported,
  FilesWritten,
  FileText,
  VendaApi
} from '@venda/contract';
import { canEditFiles, isAdministrator } from '@venda/core/auth';
import {
  importFiles,
  listFiles,
  pushFiles,
  readFile
} from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner } from '../infrastructure';

export const ContentFilesHandlers = HttpApiBuilder.group(
  VendaApi,
  'files',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: () =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(canEditFiles(user), proof =>
                Effect.map(listFiles(proof), files =>
                  files.map(file => new ContentFile(file))
                )
              )
            )
          )
        ),
      read: ({ query }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(canEditFiles(user), proof =>
                Effect.flatMap(readFile(query.path, proof), file =>
                  file === null
                    ? Effect.fail(new FileNotFound({ path: query.path }))
                    : Effect.succeed(
                        new FileText({ path: query.path, ...file })
                      )
                )
              )
            )
          )
        ),
      write: ({ payload }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(canEditFiles(user), proof =>
                Effect.map(
                  pushFiles(user, payload.message, payload.changes, proof),
                  files => new FilesWritten({ files })
                )
              )
            )
          )
        ),
      import: ({ payload }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(isAdministrator(user), proof =>
                Effect.map(
                  importFiles(user, payload.files, proof),
                  counts => new FilesImported(counts)
                )
              )
            )
          )
        )
    });
  })
);
