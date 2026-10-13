// Settings → General: the administrator edits `site.ts`, written like any
// file (files.ts) and refused if it changed since it was read. The index
// takes the new settings in the same write.
import type { Named } from '@gdp-ts/core';
import {
  InvalidContent,
  SiteDocument,
  SiteSettings as PublicSite,
  type UserId
} from '@venda/contract';
import {
  printSiteConfig,
  readSiteConfig,
  siteFrom,
  type Json
} from '@venda/content';
import { Effect, Option, Result } from 'effect';
import type { IsAdministrator } from '../auth/proofs/is-administrator';
import { authorOf } from './author';
import { fileAt, writeFiles } from './files';
import { SITE_PATH } from './site';

export interface SiteInput {
  readonly baseSha: string | null;
  readonly name: string | null;
  readonly url: string | null;
  readonly screens: Readonly<Record<string, string>>;
}

export const getSiteDocument = <A>(_admin: IsAdministrator<A>) =>
  Effect.gen(function* () {
    const file = Option.getOrNull(yield* fileAt(SITE_PATH));
    const source =
      file === null
        ? {}
        : yield* readSiteConfig(SITE_PATH, file.text).pipe(
            Effect.mapError(
              error => new InvalidContent({ message: error.message })
            )
          );

    return new SiteDocument({
      settings: new PublicSite({
        name: source.name ?? null,
        url: source.url ?? null,
        screens: source.screens ?? {}
      }),
      sha: file?.sha ?? null
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
    const settings = siteFrom(settingsOf(input));

    if (Result.isFailure(settings))
      return yield* new InvalidContent({ message: settings.failure });

    yield* writeFiles(
      [
        {
          path: SITE_PATH,
          text: printSiteConfig(settings.success),
          baseSha: input.baseSha
        }
      ],
      {
        author: yield* authorOf(user.value),
        message: 'Update site settings',
        mode: 'strict'
      }
    );

    return yield* getSiteDocument(admin);
  });
