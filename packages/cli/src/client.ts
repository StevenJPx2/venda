// The site's API through the typed contract client, with the API token as a
// bearer credential. A failed call becomes a CliFailure that says what to do.
import { VendaApi } from '@venda/contract';
import { Effect, Predicate, Result } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { CliFailure } from './failure';
import type { Login } from './login';

export const connect = (login: Login) =>
  Effect.runPromise(
    HttpApiClient.make(VendaApi, {
      baseUrl: login.url,
      transformClient: HttpClient.mapRequest(
        HttpClientRequest.bearerToken(login.token)
      )
    }).pipe(Effect.provide(FetchHttpClient.layer))
  );

export type Api = Awaited<ReturnType<typeof connect>>;

const short = (sha: string | undefined) => sha?.slice(0, 7) ?? 'deleted';

const HINTS = new Map<string, (path: string, sha?: string) => string>([
  [
    'Conflict',
    (path, sha) =>
      `${path} changed on the site since you pulled it (now ${short(sha)}); nothing was written. Run \`venda pull\` for the other changes, merge this one (\`venda show ${path}\`), then \`venda resolve ${path}\` and push again`
  ],
  ['FileNotFound', path => `${path} does not exist on the site`],
  [
    'Unauthenticated',
    () =>
      'The site refused the token: it may be revoked or expired. Run `venda login` with a new one'
  ],
  [
    'ContentTooLarge',
    () => 'Too large: a file holds at most 1 MB, and a push at most 25 MB'
  ]
]);

/** The failure a call ended with, in words. */
function failureOf<E>(error: E): CliFailure {
  if (!Predicate.isObject(error) || !Predicate.isString(error._tag))
    return new CliFailure('Unavailable', 'The site could not be reached');

  const tag = error._tag;
  const path = Predicate.isString(error.path) ? error.path : '';
  const sha = Predicate.isString(error.sha) ? error.sha : undefined;
  const own = [error.reason, error.message].find(Predicate.isString);
  const hint = HINTS.get(tag)?.(path, sha);

  return new CliFailure(tag, hint ?? own ?? tag, path || null);
}

/** Runs a client call; its failure is thrown as a CliFailure. */
export async function request<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(effect));

  if (Result.isSuccess(result)) return result.success;

  throw failureOf(result.failure);
}

/** A file's text and SHA on the site, or null when it does not exist. */
export const siteFile = (api: Api, path: string) =>
  request(
    api.files
      .read({ query: { path } })
      .pipe(Effect.catchTag('FileNotFound', () => Effect.succeed(null)))
  );
