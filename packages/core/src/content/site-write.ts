// Settings → General: the administrator edits `site.ts` and publishes it
// through the content store, refusing to replace a file that changed since
// it was read. The index takes the new settings at once, as for entries.
import {
  ContentReadOnly,
  InvalidContent,
  MAX_CONTENT_BYTES,
  SiteDocument
} from '@venda/contract';
import { SiteSettings as PublicSite } from '@venda/contract';
import {
  printSiteConfig,
  siteFrom,
  readSiteConfig,
  type Json
} from '@venda/content';
import { eq } from 'drizzle-orm';
import { Effect, Result } from 'effect';
import type { IsAdministrator } from '../auth/proofs/is-administrator';
import { ContentStore, ContentStoreError, gitBlobSha } from './services';
import type { Named } from '@gdp-ts/core';
import type { UserId } from '@venda/contract';
import { commitAuthor } from './commit-author';
import { SITE_PATH } from './site';
import { AtomicWrites, Database } from '../database';
import { contentSite, contentProblems, contentFiles } from './schema';
import { currentSha } from './work-read';

export interface SiteInput {
  readonly baseSha: string | null;
  readonly name: string | null;
  readonly url: string | null;
  readonly screens: Readonly<Record<string, string>>;
}

export const getSiteDocument = <A>(_admin: IsAdministrator<A>) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const found = yield* currentSha(SITE_PATH);
    const text = found === null ? null : yield* store.read(SITE_PATH);
    const source =
      text === null
        ? {}
        : yield* readSiteConfig(SITE_PATH, text).pipe(
            Effect.mapError(
              error => new InvalidContent({ message: error.message })
            )
          );
    const sha =
      text === null
        ? null
        : yield* Effect.promise(() =>
            gitBlobSha(new TextEncoder().encode(text))
          );

    return new SiteDocument({
      settings: new PublicSite({
        name: source.name ?? null,
        url: source.url ?? null,
        screens: source.screens ?? {}
      }),
      sha,
      writable: store.writable
    });
  });

/** The settings to write: blank values are left out, so the file stays minimal. */
function settingsOf(input: SiteInput): Json {
  const name = input.name?.trim();
  const url = input.url?.trim();

  return Object.fromEntries([
    ...(name ? [['name', name]] : []),
    ...(url ? [['url', url]] : []),
    ['screens', { ...input.screens }]
  ]);
}

export const saveSiteFile = <A>(
  user: Named<A, UserId>,
  input: SiteInput,
  admin: IsAdministrator<A>
) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;

    if (!store.writable) return yield* new ContentReadOnly();

    const settings = siteFrom(settingsOf(input));

    if (Result.isFailure(settings))
      return yield* new InvalidContent({ message: settings.failure });

    const content = printSiteConfig(settings.success);
    const bytes = new TextEncoder().encode(content);

    if (bytes.byteLength > MAX_CONTENT_BYTES)
      return yield* new InvalidContent({
        message: 'site.ts would be over 1 MB'
      });

    const sha = yield* Effect.promise(() => gitBlobSha(bytes));
    const author = yield* commitAuthor(user.value);

    const committed = yield* store.commit({
      path: SITE_PATH,
      content,
      baseSha: input.baseSha,
      sha,
      message: 'Update site settings',
      author
    });

    if (committed.sha !== sha)
      return yield* new ContentStoreError({
        message: 'The settings write returned a different SHA'
      });

    const db = yield* Database;
    const atomic = yield* AtomicWrites;
    const settingsJson = JSON.stringify(settings.success);

    yield* atomic.run([
      db
        .insert(contentSite)
        .values({ path: SITE_PATH, settingsJson })
        .onConflictDoUpdate({ target: contentSite.path, set: { settingsJson } })
        .toSQL(),
      db
        .delete(contentProblems)
        .where(eq(contentProblems.path, SITE_PATH))
        .toSQL(),
      db
        .insert(contentFiles)
        .values({ path: SITE_PATH, sha })
        .onConflictDoUpdate({ target: contentFiles.path, set: { sha } })
        .toSQL()
    ]);

    return yield* getSiteDocument(admin);
  });
