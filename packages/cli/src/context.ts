import type { Schema } from 'effect';
import type { Api } from './client';

/** What every command against a site has: its API, and its address. */
export interface Context {
  readonly api: Api;
  readonly site: string;
}

/** What a command prints: words for people, or JSON with `--json`. */
export interface Report {
  readonly text: string;
  readonly json: string;
}

export const report = (text: string, value: Schema.Json): Report => ({
  text,
  json: JSON.stringify(value, null, 2)
});

export const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

export const short = (sha: string | null | undefined) =>
  sha ? sha.slice(0, 7) : 'deleted';

/** Runs `work` over `items`, a few at a time. */
export async function inBatches<A>(
  items: ReadonlyArray<A>,
  work: (item: A) => Promise<void>,
  size = 8
) {
  for (let at = 0; at < items.length; at += size)
    await Promise.all(items.slice(at, at + size).map(work));
}
