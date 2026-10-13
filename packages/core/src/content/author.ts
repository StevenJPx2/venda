import type { UserId } from '@venda/contract';
import { Unauthenticated } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { users } from '../auth/schema';
import { Database } from '../database';
import type { Author } from './files';

/** Who a write is credited to: the active person, by the name they go by now. */
export const authorOf = (id: UserId) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [person] = yield* db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.id, id), eq(users.status, 'active')));

    if (!person) return yield* new Unauthenticated();

    return { id, name: person.name.trim() || person.email } satisfies Author;
  });
