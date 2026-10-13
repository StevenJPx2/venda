import { name, type Named } from '@gdp-ts/core';
import {
  ContentFile,
  CurrentActor,
  type UserId,
  FileNotFound,
  FilesImported,
  FileRevision,
  FilesWritten,
  FileText,
  VendaApi
} from '@venda/contract';
import {
  canEditFiles,
  isAdministrator,
  type CanEditFiles
} from '@venda/core/auth';
import {
  importFiles,
  listFiles,
  listRevisions,
  pushFiles,
  readFile,
  revisionText
} from '@venda/core/content';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner, type DomainServices } from '../infrastructure';

type Runner = Effect.Success<typeof domainRunner>;

/** Runs `work` for the signed-in person, once shown to be an administrator or editor. */
const asFileEditor = <A, E, R extends DomainServices>(
  run: Runner,
  work: <N>(
    user: Named<N, UserId>,
    proof: CanEditFiles<N>
  ) => Effect.Effect<A, E, R>
) =>
  Effect.flatMap(CurrentActor, actor =>
    run(
      name(actor.userId, user =>
        Effect.flatMap(canEditFiles(user), proof => work(user, proof))
      )
    )
  );

/** A file's text, or FileNotFound when there is none. */
const textOf = (
  path: string,
  file: { readonly text: string; readonly sha: string } | null
) =>
  file === null
    ? Effect.fail(new FileNotFound({ path }))
    : Effect.succeed(new FileText({ path, ...file }));

export const ContentFilesHandlers = HttpApiBuilder.group(
  VendaApi,
  'files',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: () =>
        asFileEditor(run, (_user, proof) =>
          Effect.map(listFiles(proof), files =>
            files.map(file => new ContentFile(file))
          )
        ),
      read: ({ query }) =>
        asFileEditor(run, (_user, proof) =>
          Effect.flatMap(readFile(query.path, proof), file =>
            textOf(query.path, file)
          )
        ),
      revisions: ({ query }) =>
        asFileEditor(run, (_user, proof) =>
          Effect.map(listRevisions(query.path, query.before, proof), rows =>
            rows.map(row => new FileRevision(row))
          )
        ),
      revision: ({ query }) =>
        asFileEditor(run, (_user, proof) =>
          Effect.flatMap(revisionText(query.path, query.sha, proof), text =>
            textOf(query.path, text === null ? null : { text, sha: query.sha })
          )
        ),
      write: ({ payload }) =>
        asFileEditor(run, (user, proof) =>
          Effect.map(
            pushFiles(user, payload.message, payload.changes, proof),
            files => new FilesWritten({ files })
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
