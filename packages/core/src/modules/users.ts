import { isRole } from '../auth/permissions';
import { countActiveAdministrators, findUserById, publicUser, toUser, type User } from '../auth/users';
import type { RequestContext } from '../context';
import { HttpError, json, notFound, readJson } from '../http';
import { route } from '../router';
import { optionalString } from '../validation';

async function listUsers(ctx: RequestContext): Promise<Response> {
  await ctx.require('users:manage');
  const rows = await ctx.services.config.db.all('SELECT * FROM users ORDER BY created_at ASC');
  return json(rows.map(row => publicUser(toUser(row))));
}

async function loadTarget(ctx: RequestContext): Promise<User> {
  const target = await findUserById(ctx.services.config.db, ctx.params.id ?? '');
  if (!target) throw notFound('User not found');
  return target;
}

/** Rejects a change that would leave no active administrator. */
async function guardLastAdministrator(ctx: RequestContext, target: User, next: { role: User['role']; status: User['status'] }): Promise<void> {
  const losingAdmin = target.role === 'administrator' && target.status === 'active' && (next.role !== 'administrator' || next.status !== 'active');

  if (losingAdmin && (await countActiveAdministrators(ctx.services.config.db)) <= 1) {
    throw new HttpError(409, 'Venda needs at least one active administrator');
  }
}

async function updateUser(ctx: RequestContext): Promise<Response> {
  await ctx.require('users:manage');
  const target = await loadTarget(ctx);
  const body = await readJson(ctx.request);

  const role = body.role === undefined ? target.role : body.role;
  if (!isRole(role)) throw new HttpError(400, 'Unknown role');
  const status = body.status === undefined ? target.status : body.status;
  if (status !== 'active' && status !== 'disabled') throw new HttpError(400, 'Status must be active or disabled');
  const name = optionalString(body, 'name')?.trim().slice(0, 120) ?? target.name;

  await guardLastAdministrator(ctx, target, { role, status });
  // Access changes invalidate the user's sessions so they take effect immediately.
  const accessChanged = role !== target.role || status !== target.status;
  await ctx.services.config.db.run(
    'UPDATE users SET name = ?, role = ?, status = ?, session_version = session_version + ?, updated_at = ? WHERE id = ?',
    name, role, status, accessChanged ? 1 : 0, new Date().toISOString(), target.id
  );
  const updated = await findUserById(ctx.services.config.db, target.id);
  if (!updated) throw notFound('User not found');
  return json(publicUser(updated));
}

async function deleteUser(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require('users:manage');
  const target = await loadTarget(ctx);
  if (target.id === actor.user.id) throw new HttpError(409, 'You cannot delete your own account');
  await guardLastAdministrator(ctx, target, { role: 'contributor', status: 'disabled' });
  // Their entries and media remain; authorship columns are cleared by the foreign keys.
  await ctx.services.config.db.run('DELETE FROM users WHERE id = ?', target.id);
  return json({ ok: true });
}

export const userRoutes = [
  route('GET', '/api/users', listUsers),
  route('PATCH', '/api/users/:id', updateUser),
  route('DELETE', '/api/users/:id', deleteUser)
];
