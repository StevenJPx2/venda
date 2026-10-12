// The site's own settings as `content/site.ts` declares them: what the site is
// called, where it lives, and the admin's copy in the owner's words.
import { Result, Schema } from 'effect';
import type { Json } from './literal';

const atMost = (max: number) =>
  Schema.isMaxLength(max, { expected: `at most ${max} characters` });

const SiteInput = Schema.Struct({
  // Shown in the admin's sidebar and its window titles.
  name: Schema.optional(Schema.NonEmptyString.check(atMost(60))),
  url: Schema.optional(
    Schema.String.pipe(
      Schema.check(
        Schema.isPattern(/^https?:\/\/[^\s/]+/, {
          expected: 'an http or https address'
        })
      )
    )
  ),
  // A screen's description by its page id, replacing the one its plugin
  // gives; an empty string shows none.
  screens: Schema.optional(
    Schema.Record(Schema.String, Schema.String.check(atMost(300)))
  )
});

export type SiteSettings = typeof SiteInput.Type;

const decodeSite = Schema.decodeUnknownResult(SiteInput);

/** Site settings from their JSON form, checked the same way as `site.ts`. */
export const siteFrom = (value: Json): Result.Result<SiteSettings, string> =>
  Result.mapError(decodeSite(value), error => error.message);
