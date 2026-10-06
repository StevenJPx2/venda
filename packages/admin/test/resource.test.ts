import { expect, it } from 'vitest';
import { useAdminResource } from '../src/runtime';

function deferred<A>() {
  let resolve!: (value: A) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<A>((ok, fail) => { resolve = ok; reject = fail; });

  return { promise, resolve, reject };
}

it('starts a newer read at once and keeps it when an older one answers late', async () => {
  const answers = [deferred<string>(), deferred<string>()];
  let call = 0;
  const resource = useAdminResource(() => answers[call++]!.promise);

  const first = resource.reload();
  const second = resource.reload();

  expect(call).toBe(2);

  answers[1]!.resolve('newer');
  await second;

  expect(resource.data.value).toBe('newer');
  expect(resource.busy.value).toBe(false);

  answers[0]!.resolve('older');
  await first;

  expect(resource.data.value).toBe('newer');
});

it('shows only the latest read\'s failure', async () => {
  const answers = [deferred<string>(), deferred<string>()];
  let call = 0;
  const resource = useAdminResource(() => answers[call++]!.promise);

  const first = resource.reload();
  const second = resource.reload();

  answers[0]!.reject(new Error('stale failure'));
  await first;

  expect(resource.error.value).toBe('');
  expect(resource.busy.value).toBe(true);

  answers[1]!.resolve('fine');
  await second;

  expect(resource.error.value).toBe('');
  expect(resource.data.value).toBe('fine');
});
