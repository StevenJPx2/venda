import { HttpError } from './http';
import type { Status } from './types';

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'Expected an object');

  return value as Record<string, unknown>;
}

export function statusInput(value: unknown): Status {
  if (value === 'draft' || value === 'published') return value;

  throw new HttpError(400, 'Status must be draft or published');
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${key} is required`);

  return value;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];

  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${key} must be text`);

  return value;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailInput(body: Record<string, unknown>, key = 'email'): string {
  const value = requiredString(body, key).trim().toLowerCase();

  if (!EMAIL.test(value) || value.length > 254) throw new HttpError(400, 'Enter a valid email address');

  return value;
}
