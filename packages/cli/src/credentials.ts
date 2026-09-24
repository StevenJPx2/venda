import { randomBytes } from 'node:crypto';

/** A 24-character URL-safe admin password (144 bits of entropy). */
export function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

/** HMAC key for signing admin sessions (256 bits). */
export function generateSessionSecret(): string {
  return randomBytes(32).toString('hex');
}
