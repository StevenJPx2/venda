// Trusted: the only place that can establish that a join link may be used.
import { defineProof, type Named, type Proof } from '@gdp-ts/core';
import { InvitationNotFound } from '@venda/contract';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DateTime, Effect } from 'effect';
import { Database } from '../../database';
import { digest } from '../crypto';
import { invitations } from '../schema';

const InvitationIsOpen = defineProof('InvitationIsOpen');

/**
 * The join-link secret `I` belongs to an invitation that is unused and
 * unexpired. Accepting re-checks this in its own update, so two tabs cannot
 * both use one link.
 */
export interface InvitationIsOpen<I> extends Proof<'InvitationIsOpen', [I]> {}

export const invitationIsOpen = <I>(secret: Named<I, string>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const now = DateTime.formatIso(yield* DateTime.now);
    const open = and(
      eq(invitations.tokenHash, yield* digest(secret.value)),
      isNull(invitations.acceptedAt),
      gt(invitations.expiresAt, now)
    );
    const [row] = yield* db
      .select({ id: invitations.id })
      .from(invitations)
      .where(open);

    if (row === undefined) return yield* new InvitationNotFound();

    const proof: InvitationIsOpen<I> = InvitationIsOpen.prove(secret);

    return proof;
  });
