import { secretsMatch } from '../auth/crypto';
import { hashPassword, passwordProblem, UNKNOWN_USER_HASH, verifyPassword } from '../auth/passwords';
import { endSession, expiredSessionCookie, startSession } from '../auth/sessions';
import { findUserByEmail, insertUser, normalizeEmail, publicUser, type User } from '../auth/users';
import type { RequestContext, Services } from '../context';
import { HttpError, json, readJson, withHeaders } from '../http';
import { route } from '../router';
import { optionalString, requiredString } from '../validation';

const MAX_FAILURES = 10;
const FAILURE_WINDOW_SECONDS = 15 * 60;

async function recordFailure(services: Services, email: string): Promise<void> {
  const key = `login-failures:${email}`;
  const count = Number(await services.config.kv.get(key)) || 0;
  await services.config.kv.put(key, String(count + 1), { ttlSeconds: FAILURE_WINDOW_SECONDS });
}

async function tooManyFailures(services: Services, email: string): Promise<boolean> {
  return (Number(await services.config.kv.get(`login-failures:${email}`)) || 0) >= MAX_FAILURES;
}

/**
 * The configured recovery admin (ADMIN_EMAIL / ADMIN_PASSWORD) always signs in
 * as an active administrator, creating or restoring the account if needed.
 */
async function recoveryAdmin(services: Services, email: string, password: string): Promise<User | null> {
  const admin = services.config.admin;
  if (!admin) return null;
  const [emailOk, passwordOk] = await Promise.all([secretsMatch(email, normalizeEmail(admin.email)), secretsMatch(password, admin.password)]);
  if (!emailOk || !passwordOk) return null;
  const { db } = services.config;
  const existing = await findUserByEmail(db, email);
  if (!existing) return insertUser(db, { email, name: '', role: 'administrator', passwordHash: null });

  if (existing.role !== 'administrator' || existing.status !== 'active') {
    await db.run("UPDATE users SET role = 'administrator', status = 'active', session_version = session_version + 1, updated_at = ? WHERE id = ?", new Date().toISOString(), existing.id);
    return findUserByEmail(db, email);
  }

  return existing;
}

async function authenticate(services: Services, email: string, password: string): Promise<User | null> {
  const recovered = await recoveryAdmin(services, email, password);
  if (recovered) return recovered;
  const user = await findUserByEmail(services.config.db, email);
  const valid = await verifyPassword(password, user?.passwordHash ?? UNKNOWN_USER_HASH);
  return valid && user?.passwordHash && user.status === 'active' ? user : null;
}

async function login(ctx: RequestContext): Promise<Response> {
  const body = await readJson(ctx.request);
  const email = normalizeEmail(requiredString(body, 'email'));
  const password = requiredString(body, 'password');
  if (await tooManyFailures(ctx.services, email)) throw new HttpError(429, 'Too many failed sign-in attempts. Try again in 15 minutes.');

  const user = await authenticate(ctx.services, email, password);

  if (!user) {
    await recordFailure(ctx.services, email);
    throw new HttpError(401, 'Invalid credentials');
  }

  const loginAt = new Date().toISOString();
  await ctx.services.config.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', loginAt, user.id);
  const cookie = await startSession(user, ctx.services.sessions);
  return withHeaders(json({ email: user.email, user: publicUser({ ...user, lastLoginAt: loginAt }) }), { 'Set-Cookie': cookie }, true);
}

async function logout(ctx: RequestContext): Promise<Response> {
  await endSession(ctx.request, ctx.services.sessions);
  return withHeaders(json({ ok: true }), { 'Set-Cookie': expiredSessionCookie }, true);
}

async function me(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.actor();
  if (!actor) return json({ email: null, user: null, capabilities: [] });
  return json({ email: actor.user.email, user: publicUser(actor.user), capabilities: [...actor.capabilities] });
}

/** Updates the signed-in user's name, or password (which requires the current one and signs out other sessions). */
async function updateMe(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require();
  const body = await readJson(ctx.request);
  const { db } = ctx.services.config;
  const now = new Date().toISOString();
  const name = optionalString(body, 'name');
  if (name !== undefined) await db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', name.trim().slice(0, 120), now, actor.user.id);

  const newPassword = optionalString(body, 'newPassword');
  if (newPassword === undefined) return json({ user: publicUser({ ...actor.user, ...(name !== undefined ? { name: name.trim().slice(0, 120) } : {}) }) });

  const problem = passwordProblem(newPassword);
  if (problem) throw new HttpError(422, problem);
  const current = optionalString(body, 'currentPassword') ?? '';
  if (actor.user.passwordHash && !(await verifyPassword(current, actor.user.passwordHash))) throw new HttpError(403, 'Your current password is incorrect');
  await db.run('UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?', await hashPassword(newPassword), now, actor.user.id);
  const refreshed = await findUserByEmail(db, actor.user.email);
  if (!refreshed) throw new HttpError(404, 'User not found');
  // Keep this browser signed in with a fresh session; every other session is now invalid.
  return withHeaders(json({ user: publicUser(refreshed) }), { 'Set-Cookie': await startSession(refreshed, ctx.services.sessions) }, true);
}

export const authRoutes = [
  route('POST', '/api/auth/login', login),
  route('POST', '/api/auth/logout', logout),
  route('GET', '/api/auth/me', me),
  route('PATCH', '/api/auth/me', updateMe)
];
