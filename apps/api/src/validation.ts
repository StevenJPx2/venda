import type { Status } from './types';

export function slugify(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }

export function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}

export function statusInput(value: unknown): Status { if (value === 'draft' || value === 'published') return value; throw new Error('Status must be draft or published'); }
