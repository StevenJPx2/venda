// Accounts: operational state, not content, so it lives only in the database.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const ROLES = ['administrator', 'editor', 'author', 'contributor'] as const;

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  role: text({ enum: ROLES }).notNull(),
  status: text({ enum: ['active', 'disabled'] }).notNull(),
  // Null for the recovery owner until they choose a password of their own.
  passwordHash: text('password_hash'),
  // Raised on every change that must end existing sessions (password, role, status).
  sessionEpoch: integer('session_epoch').notNull(),
  createdAt: text('created_at').notNull()
});

export const invitations = sqliteTable('invitations', {
  id: text().primaryKey(),
  email: text().notNull(),
  role: text({ enum: ROLES }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  acceptedAt: text('accepted_at')
}, table => [index('invitations_email').on(table.email)]);

export const apiTokens = sqliteTable('api_tokens', {
  id: text().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  secretHash: text('secret_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at')
}, table => [index('api_tokens_user').on(table.userId)]);
