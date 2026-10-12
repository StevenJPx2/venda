import { expect, it } from 'vitest';
import { navigationChecks } from '../src/navigation';

it('waits for active screens and unregisters them when they unmount', async () => {
  const nav = navigationChecks();
  const calls: string[] = [];
  const remove = nav.beforeNavigate(async () => {
    calls.push('saved');
  });

  expect(await nav.prepareNavigation()).toBe(true);
  remove();
  expect(await nav.prepareNavigation()).toBe(true);
  expect(calls).toEqual(['saved']);
});

it('stays on the current screen when its save fails', async () => {
  const nav = navigationChecks();

  nav.beforeNavigate(() => Promise.reject(new Error('Offline')));

  expect(await nav.prepareNavigation()).toBe(false);
});
