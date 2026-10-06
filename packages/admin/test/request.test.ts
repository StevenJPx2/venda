import { Forbidden, InvalidCredentials } from '@venda/contract';
import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { request } from '../src/runtime';

it('runs typed calls and shows domain reasons without leaking infrastructure errors', async () => {
  expect(await request(Effect.succeed('ok'))).toBe('ok');
  await expect(request(Effect.fail(new InvalidCredentials()))).rejects.toMatchObject({ tag: 'InvalidCredentials', message: 'The email or password is incorrect.' });
  await expect(request(Effect.fail(new Forbidden({ reason: 'Only administrators' })))).rejects.toThrow('Only administrators');
  await expect(request(Effect.fail('SQL or network details'))).rejects.toThrow('Check your connection');
});
