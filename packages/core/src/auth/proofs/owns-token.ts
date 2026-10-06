// Trusted: the only place that can establish that an API token is someone's own.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { type TokenId, TokenNotFound, type UserId } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { apiTokens } from '../schema';

const OwnsToken = defineProof('OwnsToken');

/** API token `K` belongs to user `U`. Anyone else's token is reported as not found, so ids do not leak. */
export interface OwnsToken<U, K> extends Proof<'OwnsToken', [U, K]> {}

export const ownsToken = <U, K>(
  user: Named<U, UserId>,
  token: Named<K, TokenId>
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const theirs = and(
      eq(apiTokens.id, token.value),
      eq(apiTokens.userId, user.value)
    );
    const [row] = yield* db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(theirs);

    if (row === undefined) return yield* new TokenNotFound();

    const proof: OwnsToken<U, K> = OwnsToken.prove(user, token);

    return proof;
  });
