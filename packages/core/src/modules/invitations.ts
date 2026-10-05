import { randomToken, sha256 } from '../auth/crypto';
import { hashPassword, passwordProblem } from '../auth/passwords';
import { isRole } from '../auth/permissions';
import { startSession } from '../auth/sessions';
import { findUserByEmail, insertUser, publicUser } from '../auth/users';
import type { RequestContext } from '../context';
import { HttpError, json, notFound, readJson, withHeaders } from '../http';
import { route } from '../router';
import type { Row } from '../runtime';
import { emailInput, optionalString, requiredString } from '../validation';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toInvitation(row: Row) {
  return { id: String(row.id), email: String(row.email), role: String(row.role), createdAt: String(row.created_at), expiresAt: String(row.expires_at) };
}

async function createInvitation(ctx: RequestContext): Promise<Response> {
  const actor = await ctx.require('users:manage');
  const body = await readJson(ctx.request);
  const email = emailInput(body);
  const role = body.role;

  if (!isRole(role)) throw new HttpError(400, 'Unknown role');

  const { db } = ctx.services.config;

  if (await findUserByEmail(db, email)) throw new HttpError(409, 'A user with this email already exists');

  // One open invitation per address: a new invitation replaces an unused one.
  await db.run('DELETE FROM invitations WHERE email = ? AND accepted_at IS NULL', email);
  const token = randomToken();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO invitations (id, email, role, token_hash, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, email, role, await sha256(token), actor.user.id, new Date(now).toISOString(), new Date(now + INVITATION_TTL_MS).toISOString()
  );
  const invitation = await db.first('SELECT * FROM invitations WHERE id = ?', id);

  if (!invitation) throw new Error('Invitation vanished after insert');

  // The token is returned once, so the admin can share the acceptance link.
  return json({ invitation: toInvitation(invitation), token }, { status: 201 });
}

async function listInvitations(ctx: RequestContext): Promise<Response> {
  await ctx.require('users:manage');
  const rows = await ctx.services.config.db.all('SELECT * FROM invitations WHERE accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC', new Date().toISOString());
  return json(rows.map(toInvitation));
}

async function revokeInvitation(ctx: RequestContext): Promise<Response> {
  await ctx.require('users:manage');
  await ctx.services.config.db.run('DELETE FROM invitations WHERE id = ? AND accepted_at IS NULL', ctx.params.id ?? '');
  return json({ ok: true });
}

async function openInvitation(ctx: RequestContext): Promise<Row> {
  const row = await ctx.services.config.db.first(
    'SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?',
    await sha256(ctx.params.token ?? ''), new Date().toISOString()
  );

  if (!row) throw notFound('This invitation is invalid or has expired');

  return row;
}

async function viewInvitation(ctx: RequestContext): Promise<Response> {
  const { email, role, expiresAt } = toInvitation(await openInvitation(ctx));
  return json({ email, role, expiresAt });
}

/** Creates the invited account, marks the invitation used and signs the new user in. */
async function acceptInvitation(ctx: RequestContext): Promise<Response> {
  const invitation = await openInvitation(ctx);
  const body = await readJson(ctx.request);
  const password = requiredString(body, 'password');
  const problem = passwordProblem(password);

  if (problem) throw new HttpError(422, problem);

  const role = invitation.role;

  if (!isRole(role)) throw new Error('Invitation has an unknown role');

  const { db } = ctx.services.config;
  // Claim the invitation first; a concurrent acceptance changes no rows and stops here.
  const claimed = await db.run('UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL', new Date().toISOString(), String(invitation.id));

  if (claimed.changes !== 1) throw notFound('This invitation is invalid or has expired');
  if (await findUserByEmail(db, String(invitation.email))) throw new HttpError(409, 'A user with this email already exists');

  const name = optionalString(body, 'name')?.trim().slice(0, 120) ?? '';
  const user = await insertUser(db, { email: String(invitation.email), name, role, passwordHash: await hashPassword(password) });
  return withHeaders(json({ email: user.email, user: publicUser(user) }, { status: 201 }), { 'Set-Cookie': await startSession(user, ctx.services.sessions) }, true);
}

export const invitationRoutes = [
  route('GET', '/api/invitations', listInvitations),
  route('POST', '/api/invitations', createInvitation),
  route('DELETE', '/api/invitations/:id', revokeInvitation),
  route('GET', '/api/auth/invitations/:token', viewInvitation),
  route('POST', '/api/auth/invitations/:token', acceptInvitation)
];
