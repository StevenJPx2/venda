import type { UserId } from '@venda/contract';
import { Unauthenticated } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { users } from '../auth/schema';
import { Database } from '../database';

/** Git attribution uses a display name, never the person's private email. */
export const commitAuthor = (id: UserId) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [person] = yield* db
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, id), eq(users.status, 'active')));

    if (!person) return yield* new Unauthenticated();

    return `${person.name.trim() || 'Editor'} via Venda`;
  });
