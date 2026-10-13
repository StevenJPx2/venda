// A new entry starts as a working copy with no file and no base SHA, owned by
// whoever started it. Publishing writes its file only if none appeared there
// meanwhile, so a file an agent pushed is never overwritten.
import type { Named } from '@gdp-ts/core';
import {
  EntryRef,
  InvalidContent,
  SlugTaken,
  MAX_CONTENT_BYTES,
  ContentTooLarge,
  type UserId
} from '@venda/contract';
import { checkEntryData } from '@venda/content';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { DateTime, Effect, Result, Schema } from 'effect';
import type { CanCreateEntry } from '../auth/proofs/can-create-entry';
import { Database } from '../database';
import { contentEntries, contentWork } from './schema';
import { currentSha, modelFor } from './work-read';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const decodeRef = Schema.decodeUnknownSync(EntryRef);

export interface CreateInput {
  readonly slug: string;
  readonly data: Readonly<Record<string, Schema.Json>>;
}

/** Why a slug cannot be used in this collection, if it cannot. */
const slugProblem = (kind: string, slug: string) => {
  if (!SLUG.test(slug))
    return 'A slug uses lowercase letters and digits, with hyphens between words';

  if (kind === 'single' && slug !== 'index')
    return 'A single collection has one entry, index';
};

/** Whether any file, indexed entry or working copy already uses the slug. */
const slugUsed = (collection: string, slug: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const sameSlug = (table: typeof contentEntries | typeof contentWork) =>
      and(eq(table.collection, collection), eq(table.slug, slug));
    const [indexed] = yield* db
      .select({ slug: contentEntries.slug })
      .from(contentEntries)
      .where(sameSlug(contentEntries));
    const [copy] = yield* db
      .select({ slug: contentWork.slug })
      .from(contentWork)
      .where(
        and(
          sameSlug(contentWork),
          or(eq(contentWork.dirty, true), isNotNull(contentWork.baseSha))
        )
      );
    const files = yield* Effect.all([
      currentSha(`${collection}/${slug}.md`),
      currentSha(`${collection}/${slug}.mdx`)
    ]);

    return Boolean(indexed ?? copy) || files.some(sha => sha !== null);
  });

export const createEntry = <U, C>(
  user: Named<U, UserId>,
  collection: Named<C, string>,
  input: CreateInput,
  _proof: CanCreateEntry<U, C>
) =>
  Effect.gen(function* () {
    if (
      new TextEncoder().encode(JSON.stringify(input)).byteLength >
      MAX_CONTENT_BYTES
    )
      return yield* new ContentTooLarge();

    const ref = decodeRef({ collection: collection.value, slug: input.slug });
    const model = yield* modelFor(ref);
    const problem =
      slugProblem(model.kind, input.slug) ??
      Result.match(checkEntryData(model, input.data, null), {
        onFailure: message => message,
        onSuccess: () => undefined
      });

    if (problem) return yield* new InvalidContent({ message: problem });

    if (yield* slugUsed(ref.collection, ref.slug))
      return yield* new SlugTaken({ slug: ref.slug });

    const db = yield* Database;
    const now = DateTime.formatIso(yield* DateTime.now);
    const values = {
      path: `${ref.collection}/${ref.slug}.md`,
      baseSha: null,
      dataJson: JSON.stringify(input.data),
      extraJson: '{}',
      dirty: true,
      ownerId: user.value,
      updatedBy: user.value,
      updatedAt: now
    };
    const [row] = yield* db
      .insert(contentWork)
      .values({ ...ref, ...values })
      .onConflictDoUpdate({
        target: [contentWork.collection, contentWork.slug],
        set: { ...values, revision: sql`${contentWork.revision} + 1` },
        // Only a discarded draft's hidden record may be reused.
        setWhere: sql`${contentWork.status} = 'active' AND ${contentWork.baseSha} IS NULL AND ${contentWork.dirty} = 0`
      })
      .returning();

    if (!row) return yield* new SlugTaken({ slug: ref.slug });

    // The caller names this ref and reads the copy through the edit proof.
    return ref;
  });
