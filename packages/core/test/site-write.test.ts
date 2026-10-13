import { name, type Named } from '@gdp-ts/core';
import { UserId } from '@venda/contract';
import { Effect, Result, Schema } from 'effect';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { isAdministrator } from '../src/auth';
import { getSite, getSiteDocument, saveSiteFile } from '../src/content';
import { author, writeHarness } from './write-support';

let h: Awaited<ReturnType<typeof writeHarness>>;

beforeEach(async () => {
  h = await writeHarness();
});

afterEach(() => h.close());

const admin = Schema.decodeUnknownSync(UserId)('admin');

const asAdmin = <A, E, R>(
  id: UserId,
  action: <U>(
    user: Named<U, UserId>,
    proof: Parameters<typeof getSiteDocument<U>>[0]
  ) => Effect.Effect<A, E, R>
) =>
  name(id, user =>
    Effect.flatMap(isAdministrator(user), proof => action(user, proof))
  );

it('writes site.ts canonically, indexes it at once, and refuses a stale base', async () => {
  const before = await h.run(
    asAdmin(admin, (_user, proof) => getSiteDocument(proof))
  );

  expect(before.sha).toBeNull();

  const saved = await h.run(
    asAdmin(admin, (user, proof) =>
      saveSiteFile(
        user,
        {
          baseSha: null,
          name: ' Hill Notes ',
          url: '',
          screens: { settings: 'Ours.' }
        },
        proof
      )
    )
  );

  expect(saved.sha).not.toBeNull();
  expect(await h.file('site.ts')).toContain("name: 'Hill Notes'");
  expect(await h.run(getSite)).toMatchObject({ name: 'Hill Notes', url: null });

  const stale = await h.run(
    Effect.result(
      asAdmin(admin, (user, proof) =>
        saveSiteFile(
          user,
          { baseSha: null, name: 'Other', url: null, screens: {} },
          proof
        )
      )
    )
  );

  expect(Result.isFailure(stale) && stale.failure._tag).toBe('Conflict');
  expect(
    Result.isFailure(
      await h.run(
        Effect.result(asAdmin(author, (_user, proof) => getSiteDocument(proof)))
      )
    )
  ).toBe(true);
});

it('reads settings and their SHA from the file as it is now', async () => {
  await h.outside(
    'site.ts',
    "export default defineSite({ name: 'Latest on disk' });"
  );

  const current = await h.run(
    asAdmin(admin, (_user, proof) => getSiteDocument(proof))
  );

  expect(current.settings.name).toBe('Latest on disk');
  expect(current.sha).not.toBeNull();
});
