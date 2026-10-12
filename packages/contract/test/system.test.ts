import { Schema } from 'effect';
import { OpenApi } from 'effect/http-api';
import { describe, expect, it } from 'vitest';
import { HealthStatus, VendaApi } from '../src';

describe('HealthStatus', () => {
  const decode = Schema.decodeUnknownSync(HealthStatus);

  it('accepts the payload the server sends', () => {
    expect(decode({ ok: true, version: '0.1.0' })).toEqual(
      new HealthStatus({ ok: true, version: '0.1.0' })
    );
  });

  it('rejects anything else', () => {
    expect(() => decode({ ok: false, version: '0.1.0' })).toThrow();
    expect(() => decode({ ok: true })).toThrow();
  });
});

describe('VendaApi', () => {
  it('serves its paths under the /api prefix', () => {
    expect(Object.keys(OpenApi.fromApi(VendaApi).paths)).toEqual([
      '/api/health',
      '/api/site',
      '/api/content/{collection}',
      '/api/content/{collection}/{slug}',
      '/api/auth/sign-in',
      '/api/auth/sign-out',
      '/api/auth/me',
      '/api/auth/password',
      '/api/users',
      '/api/users/{id}',
      '/api/invitations',
      '/api/invitations/{id}',
      '/api/join/{token}',
      '/api/tokens',
      '/api/tokens/{id}',
      '/api/admin/collections',
      '/api/admin/collections/{collection}/entries',
      '/api/admin/content-problems',
      '/api/admin/collections/{collection}/entries/{slug}'
    ]);
  });

  it('requires a session cookie or a bearer token where it authenticates', () => {
    const spec = OpenApi.fromApi(VendaApi);

    expect(spec.components.securitySchemes).toMatchObject({
      session: { type: 'apiKey', in: 'cookie', name: 'venda_session' },
      token: { type: 'http', scheme: 'Bearer' }
    });
    expect(spec.paths['/api/auth/me']?.get?.security).toEqual([
      { token: [] },
      { session: [] }
    ]);
    expect(spec.paths['/api/auth/sign-in']?.post?.security).toEqual([]);
  });
});
