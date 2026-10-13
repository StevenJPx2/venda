// The site's own settings, `site.ts` at the root of the content: indexed like
// a collection's config, and read back for the admin.
import { siteFrom, type SiteSettings } from '@venda/content';
import { SiteSettings as PublicSite } from '@venda/contract';
import { Effect, Option, Result } from 'effect';
import { contentSite } from './schema';
import { decodeJson } from './tables';
import { Database } from '../database';

export const SITE_PATH = 'site.ts';

/** The statement that saves the site's settings, for a sync batch. */
export const saveSite = (path: string, settings: SiteSettings) =>
  Effect.map(Database, db => {
    const settingsJson = JSON.stringify(settings);

    return [
      db
        .insert(contentSite)
        .values({ path, settingsJson })
        .onConflictDoUpdate({ target: contentSite.path, set: { settingsJson } })
        .toSQL()
    ];
  });

export const dropSite = Effect.map(Database, db => [
  db.delete(contentSite).toSQL()
]);

/** The settings as last indexed: none until `site.ts` exists and is valid. */
export const siteSettings = Effect.gen(function* () {
  const db = yield* Database;
  const [row] = yield* db
    .select({ settingsJson: contentSite.settingsJson })
    .from(contentSite);
  const settings = Option.flatMap(Option.fromNullishOr(row), each =>
    Option.flatMap(decodeJson(each.settingsJson), json =>
      Result.getSuccess(siteFrom(json))
    )
  );

  return Option.getOrElse(settings, (): SiteSettings => ({}));
});

/** The settings as the API serves them. */
export const getSite = Effect.map(
  siteSettings,
  settings =>
    new PublicSite({
      name: settings.name ?? null,
      url: settings.url ?? null,
      screens: settings.screens ?? {}
    })
);
