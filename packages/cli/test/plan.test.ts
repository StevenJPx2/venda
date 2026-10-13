import { describe, expect, it } from 'vitest';
import { pendingChanges, planPull } from '../src/plan';

const shas = (entries: Record<string, string>) =>
  new Map(Object.entries(entries));

describe('a pull', () => {
  it('follows the site for files unchanged here, and keeps what changed here', () => {
    const plan = planPull(
      shas({ 'a.md': '1', 'b.md': 'mine', 'new.md': 'n', 'c.md': '3' }),
      shas({ 'a.md': '1', 'b.md': '2', 'c.md': '3', 'gone.md': '4' }),
      shas({ 'a.md': '1b', 'b.md': '2', 'gone.md': '4', 'site.md': '5' }),
      false
    );

    expect(plan).toEqual({
      fetch: ['a.md', 'site.md'],
      remove: ['c.md'],
      conflicts: [],
      manifest: shas({
        'a.md': '1b',
        'b.md': '2',
        'gone.md': '4',
        'site.md': '5'
      })
    });
  });

  it('reports files changed on both sides, and leaves them alone', () => {
    const plan = planPull(
      shas({ 'a.md': 'mine', 'b.md': 'theirs' }),
      shas({ 'a.md': '1', 'c.md': '3' }),
      shas({ 'a.md': '1b', 'b.md': 'theirs-on-site', 'c.md': '3b' }),
      false
    );

    expect(plan.conflicts).toEqual(['a.md', 'b.md', 'c.md']);
    expect(plan.fetch).toEqual([]);
    expect(plan.manifest).toEqual(shas({ 'a.md': '1', 'c.md': '3' }));
  });

  it('drops changes here when asked, and records files already the same', () => {
    const plan = planPull(
      shas({ 'a.md': 'mine', 'b.md': '2', 'same.md': 's' }),
      shas({ 'a.md': '1', 'b.md': '2' }),
      shas({ 'a.md': '1', 'same.md': 's' }),
      true
    );

    expect(plan).toEqual({
      fetch: ['a.md'],
      remove: ['b.md'],
      conflicts: [],
      manifest: shas({ 'a.md': '1', 'same.md': 's' })
    });
  });
});

it('lists changed, new and deleted files from the SHAs they were pulled at', () => {
  expect(
    pendingChanges(
      shas({ 'a.md': '1b', 'b.md': '2', 'new.md': 'n' }),
      shas({ 'a.md': '1', 'b.md': '2', 'gone.md': '4' })
    )
  ).toEqual([
    { path: 'a.md', kind: 'changed', baseSha: '1' },
    { path: 'gone.md', kind: 'deleted', baseSha: '4' },
    { path: 'new.md', kind: 'new', baseSha: null }
  ]);
});
