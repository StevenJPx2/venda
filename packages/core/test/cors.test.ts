import { describe, expect, it } from 'vitest';
import { secretsMatch } from '../src/auth';
import { allowedAdminOrigins, corsHeaders } from '../src/cors';

const admins = allowedAdminOrigins(' https://app.example.com/ , http://localhost:3000');

describe('allowedAdminOrigins', () => {
  it('trims entries and trailing slashes, ignoring blanks', () => {
    expect([...admins]).toEqual(['https://app.example.com', 'http://localhost:3000']);
    expect(allowedAdminOrigins(undefined).size).toBe(0);
    expect(allowedAdminOrigins(' , ').size).toBe(0);
  });
});

describe('corsHeaders', () => {
  it('adds nothing for same-origin requests without an Origin header', () => {
    expect(corsHeaders('POST', '/api/collections', null, admins)).toBeNull();
  });

  it('opens public reads to any origin, without credentials', () => {
    const headers = corsHeaders('GET', '/api/content/blog', 'https://anyone.example', admins);
    expect(headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(headers?.['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(corsHeaders('GET', '/api/media/abc', 'https://anyone.example', admins)?.['Access-Control-Allow-Origin']).toBe('*');
    expect(corsHeaders('GET', '/api/health', 'https://anyone.example', admins)?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('never grants credentials to an unlisted origin on admin endpoints', () => {
    expect(corsHeaders('GET', '/api/collections', 'https://evil.example', admins)).toBeNull();
    expect(corsHeaders('POST', '/api/auth/login', 'https://evil.example', admins)).toBeNull();
    // Writes to "public" paths are not public.
    expect(corsHeaders('POST', '/api/media', 'https://evil.example', admins)).toBeNull();
  });

  it('echoes a listed admin origin with credentials', () => {
    const headers = corsHeaders('PATCH', '/api/entries/1', 'https://app.example.com', admins);
    expect(headers?.['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(headers?.['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers?.Vary).toBe('Origin');
  });
});

describe('secretsMatch', () => {
  it('compares exactly, including different lengths', async () => {
    expect(await secretsMatch('s3cret', 's3cret')).toBe(true);
    expect(await secretsMatch('s3cret', 's3creT')).toBe(false);
    expect(await secretsMatch('s3cret', 's3cret-longer')).toBe(false);
    expect(await secretsMatch('', '')).toBe(true);
  });
});
