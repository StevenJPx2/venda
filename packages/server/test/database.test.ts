import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from 'db0';
import nodeSqlite from 'db0/connectors/node-sqlite';
import { describe, expect, it } from 'vitest';
import { db0Database, migrate, type Migration } from '../src/database';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../core/migrations', import.meta.url));

async function coreMigrations(): Promise<Migration[]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter(name => name.endsWith('.sql'));

  return Promise.all(names.map(async name => ({ name, sql: await readFile(join(MIGRATIONS_DIR, name), 'utf8') })));
}

const memory = () => createDatabase(nodeSqlite({ name: ':memory:' }));

describe('migrate', () => {
  it('applies the core migrations once, in order', async () => {
    const db = memory();
    const migrations = await coreMigrations();

    expect(await migrate(db, migrations.toReversed())).toEqual(['0001_initial.sql', '0002_users.sql', '0003_lifecycle.sql', '0004_content_index.sql']);
    expect(await migrate(db, migrations)).toEqual([]);
  });

  it('rolls back a failing migration and reports it', async () => {
    const db = memory();
    const broken = [{ name: '0001_broken.sql', sql: 'CREATE TABLE ok (id TEXT); CREATE TABLE ok (id TEXT);' }];

    await expect(migrate(db, broken)).rejects.toThrow('Migration 0001_broken.sql failed');
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").all()).toEqual([]);
  });
});

describe('db0Database', () => {
  it('reads, writes and counts changed rows like the legacy adapters', async () => {
    const db = memory();

    await db.exec('CREATE TABLE things (id TEXT PRIMARY KEY, flag INTEGER, note TEXT)');
    const things = db0Database(db);

    expect(await things.run('INSERT INTO things VALUES (?, ?, ?)', 'a', true, undefined)).toEqual({ changes: 1 });
    expect(await things.run('INSERT INTO things VALUES (?, ?, ?)', 'b', false, 'x')).toEqual({ changes: 1 });
    expect(await things.all('SELECT * FROM things ORDER BY id')).toEqual([{ id: 'a', flag: 1, note: null }, { id: 'b', flag: 0, note: 'x' }]);
    expect(await things.first('SELECT id FROM things WHERE id = ?', 'missing')).toBeNull();
    expect(await things.run('UPDATE things SET note = ?', 'y')).toEqual({ changes: 2 });
  });

  it('refuses values the core never binds', async () => {
    const things = db0Database(memory());

    await expect(things.all('SELECT ?', { not: 'sql' })).rejects.toThrow();
  });
});
