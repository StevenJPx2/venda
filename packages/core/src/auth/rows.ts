// Account rows as the contract's types. Ids come from our own tables, so
// decoding them only adds their brand.
import { ApiToken, Invitation, InvitationId, TokenId, User, UserId } from '@venda/contract';
import { Schema } from 'effect';
import type { apiTokens, invitations, users } from './schema';

export const asUserId = Schema.decodeSync(UserId);

const asInvitationId = Schema.decodeSync(InvitationId);

const asTokenId = Schema.decodeSync(TokenId);

export const toUser = (row: typeof users.$inferSelect) => new User({
  id: asUserId(row.id),
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  createdAt: row.createdAt
});

export const toInvitation = (row: typeof invitations.$inferSelect) => new Invitation({ id: asInvitationId(row.id), email: row.email, role: row.role, expiresAt: row.expiresAt });

export const toToken = (row: typeof apiTokens.$inferSelect) => new ApiToken({ id: asTokenId(row.id), name: row.name, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt });

/** Emails compare case-insensitively and without surrounding spaces. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
