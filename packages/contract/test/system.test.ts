import { Schema } from 'effect';
import { OpenApi } from 'effect/http-api';
import { describe, expect, it } from 'vitest';
import { HealthStatus, VendaApi } from '../src';

describe('HealthStatus', () => {
  const decode = Schema.decodeUnknownSync(HealthStatus);

  it('accepts the payload the server sends', () => {
    expect(decode({ ok: true, version: '0.1.0' })).toEqual(new HealthStatus({ ok: true, version: '0.1.0' }));
  });

  it('rejects anything else', () => {
    expect(() => decode({ ok: false, version: '0.1.0' })).toThrow();
    expect(() => decode({ ok: true })).toThrow();
  });
});

describe('VendaApi', () => {
  it('serves health under the /api prefix', () => {
    expect(Object.keys(OpenApi.fromApi(VendaApi).paths)).toEqual(['/api/health']);
  });
});
