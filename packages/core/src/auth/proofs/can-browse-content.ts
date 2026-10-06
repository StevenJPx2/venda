// Trusted: a person's current role decides whether file drafts are visible.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { Unauthenticated, type UserId } from '@venda/contract';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Database } from '../../database';
import { users } from '../schema';

const CanReadAllContent = defineProof('CanReadAllContent');

const CanReadPublishedContent = defineProof('CanReadPublishedContent');

export interface CanReadAllContent<U> extends Proof<'CanReadAllContent', [U]> {}

export interface CanReadPublishedContent<U> extends Proof<
  'CanReadPublishedContent',
  [U]
> {}

export type CanBrowseContent<U> =
  CanReadAllContent<U> | CanReadPublishedContent<U>;

export const canBrowseContent = <U>(user: Named<U, UserId>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const active = and(eq(users.id, user.value), eq(users.status, 'active'));
    const [row] = yield* db
      .select({ role: users.role })
      .from(users)
      .where(active);

    if (row === undefined) return yield* new Unauthenticated();

    const proof: CanBrowseContent<U> =
      row.role === 'administrator' || row.role === 'editor'
        ? CanReadAllContent.prove(user)
        : CanReadPublishedContent.prove(user);

    return proof;
  });
