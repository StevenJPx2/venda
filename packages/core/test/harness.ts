import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVenda, type Venda, type VendaConfig } from '../src';
import { fileStore, memoryKv, sqlite, type SqliteDatabase } from '../src/adapters/node';

export const RECOVERY_ADMIN = { email: 'owner@example.com', password: 'recovery-password' };

export interface Harness {
  venda: Venda;
  db: SqliteDatabase;
  client(): Client;
  close(): Promise<void>;
}

/** A browser-like caller with its own cookie jar, or a bearer token. */
export class Client {
  cookie = '';
  bearer = '';
  constructor(private readonly venda: Venda) {}

  async call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
    const headers = new Headers(init.headers);

    if (this.cookie) headers.set('Cookie', this.cookie);
    if (this.bearer) headers.set('Authorization', `Bearer ${this.bearer}`);

    let body = init.body ?? null;

    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.json);
    }

    const response = await this.venda.fetch(new Request(`http://venda.test${path}`, { ...init, headers, body }));
    const setCookie = response.headers.get('Set-Cookie');

    if (setCookie?.startsWith('venda_session=')) this.cookie = setCookie.includes('Max-Age=0') ? '' : setCookie.split(';')[0]!;

    return response;
  }

  async data<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const response = await this.call(path, init);

    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`);

    return response.json() as Promise<T>;
  }

  login(email: string, password: string): Promise<Response> {
    return this.call('/api/auth/login', { method: 'POST', json: { email, password } });
  }
}

export async function createHarness(overrides: Partial<VendaConfig> = {}): Promise<Harness> {
  const db = sqlite(':memory:');
  await db.migrate();
  const mediaDir = await mkdtemp(join(tmpdir(), 'venda-test-'));
  const venda = createVenda({ db, storage: fileStore(mediaDir), kv: memoryKv(), admin: RECOVERY_ADMIN, sessionSecret: 'test-secret', ...overrides });
  return {
    venda,
    db,
    client: () => new Client(venda),
    async close() {
      db.close();
      await rm(mediaDir, { recursive: true, force: true });
    }
  };
}

/** Signs in the recovery admin and creates a user with `role` through a real invitation. */
export async function inviteUser(h: Harness, admin: Client, email: string, role: string, password = 'a-strong-password'): Promise<Client> {
  const { token } = await admin.data<{ token: string }>('/api/invitations', { method: 'POST', json: { email, role } });
  const user = h.client();
  await user.data(`/api/auth/invitations/${token}`, { method: 'POST', json: { password, name: email.split('@')[0] } });
  return user;
}

export async function signedInAdmin(h: Harness): Promise<Client> {
  const admin = h.client();
  const response = await admin.login(RECOVERY_ADMIN.email, RECOVERY_ADMIN.password);

  if (!response.ok) throw new Error(`Admin sign-in failed: ${response.status}`);

  return admin;
}
