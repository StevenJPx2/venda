// Shared database facts used only by the entry policy modules.
import type { Named } from '@gdp-ts/core';
import { Unauthenticated, type EntryRef, type UserId } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { contentWork } from '../../content/schema';
import { users } from '../schema';

export const entryAccess = <U, E>(
  user: Named<U, UserId>,
  entry: Named<E, EntryRef>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [actor] = yield* db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, user.value), eq(users.status, 'active')));

    if (!actor) return yield* new Unauthenticated();

    const [work] = yield* db
      .select({ ownerId: contentWork.ownerId })
      .from(contentWork)
      .where(
        and(
          eq(contentWork.collection, entry.value.collection),
          eq(contentWork.slug, entry.value.slug)
        )
      );

    return {
      owns: work?.ownerId === user.value,
      editor: actor.role === 'administrator' || actor.role === 'editor',
      contributor: actor.role === 'contributor'
    };
  });
