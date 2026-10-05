import type { Database, Row } from '../runtime';
import { isRole, type Role } from './permissions';

export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  sessionVersion: number;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** The fields safe to send to clients. */
export type PublicUser = Omit<User, 'passwordHash' | 'sessionVersion'>;

export function toUser(row: Row): User {
  const role = row.role;

  // The CHECK constraint on users.role guarantees a known role.
  if (!isRole(role)) throw new Error(`User ${String(row.id)} has an unknown role`);

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? ''),
    role,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    sessionVersion: Number(row.session_version),
    passwordHash: row.password_hash === null || row.password_hash === undefined ? null : String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null
  };
}

export function publicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt, lastLoginAt: user.lastLoginAt };
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export async function findUserById(db: Database, id: string): Promise<User | null> {
  const row = await db.first('SELECT * FROM users WHERE id = ?', id);
  return row ? toUser(row) : null;
}

export async function findUserByEmail(db: Database, email: string): Promise<User | null> {
  const row = await db.first('SELECT * FROM users WHERE email = ?', normalizeEmail(email));
  return row ? toUser(row) : null;
}

export async function insertUser(db: Database, user: { email: string; name: string; role: Role; passwordHash: string | null }): Promise<User> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO users (id, email, name, role, status, password_hash, session_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    id, normalizeEmail(user.email), user.name, user.role, 'active', user.passwordHash, now, now
  );
  const created = await findUserById(db, id);

  if (!created) throw new Error('User vanished after insert');

  return created;
}

export async function countActiveAdministrators(db: Database): Promise<number> {
  const row = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'administrator' AND status = 'active'");
  return Number(row?.n ?? 0);
}
