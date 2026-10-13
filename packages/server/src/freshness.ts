// How the index keeps up with each kind of content source:
// - A watched folder: before each request, re-index whatever changed, so an
//   edit on disk is served by the next request.
// - Built-in content: index once per isolate; it changes only with a deploy.
// - A pushed repository: webhook deliveries and the scheduled check ask for
//   a sync that runs in the background. A request waits only while the index
//   has never been built.
import { Option } from 'effect';
import type { ContentSync } from './content';
import type { ContentSource, PushedUpdates } from './target';

const pending = (state: Awaited<ReturnType<ContentSync['state']>>) =>
  Option.match(state, {
    onNone: () => true,
    onSome: row => row.requested > row.handled
  });

const indexed = (state: Awaited<ReturnType<ContentSync['state']>>) =>
  Option.exists(state, row => row.indexedVersion !== null);

export interface Freshness {
  /** When the app starts. */
  readonly start: () => Promise<void>;
  /** Before a request: wait for whatever must be indexed first. */
  readonly before: () => Promise<void>;
  /** After a request: a write may have changed a watched folder. */
  readonly after: (method: string) => void;
  /** The scheduled check: compare the source's head, and catch up. */
  readonly tick: () => Promise<void>;
  /** A webhook delivery, for a pushed source; 404 for any other. */
  readonly webhook: (request: Request) => Promise<Response>;
}

export function freshness(
  source: ContentSource,
  sync: ContentSync,
  background: (work: Promise<unknown>) => void
): Freshness {
  const updates = source.updates;
  // Indexed at start, or a repository indexed at least once.
  let ready = false;

  // The re-index a watched change started; requests that arrive meanwhile
  // wait for it too, not only the one that noticed the change.
  let refreshing: Promise<void> = Promise.resolve();

  const before = async () => {
    if (updates.kind === 'watched') {
      if (await updates.changed())
        refreshing = sync.request().then(sync.catchUp);

      await refreshing;

      return sync.settled();
    }

    if (ready) return;

    if (!indexed(await sync.state())) await sync.catchUp();

    ready = indexed(await sync.state());
  };

  return {
    // A folder or built-in content is indexed before the app answers; a
    // repository never holds up startup.
    start: async () => {
      if (updates.kind === 'pushed') return;

      // Records where a watched folder stands, so the first request does not sync again.
      if (updates.kind === 'watched') await updates.changed();

      await sync.catchUp();
      ready = true;
    },
    before,
    after: method => {
      if (
        updates.kind === 'watched' &&
        !['GET', 'HEAD', 'OPTIONS'].includes(method)
      )
        updates.invalidate();
    },
    tick: async () => {
      if (updates.kind === 'pushed') await requestIfMoved(updates, sync);

      if (pending(await sync.state())) await sync.catchUp();
    },
    webhook: async request => {
      if (updates.kind !== 'pushed') return new Response(null, { status: 404 });

      const delivery = await updates.delivery(request);

      if (delivery === 'refused') return new Response(null, { status: 401 });

      if (delivery === 'push') {
        await sync.request();
        background(sync.catchUp());
      }

      return new Response(null, { status: 202 });
    }
  };
}

/** Asks for a sync when the branch moved past what the index holds. */
async function requestIfMoved(updates: PushedUpdates, sync: ContentSync) {
  const head = await updates.head().catch((error: Error) => {
    console.error(`[venda] GitHub unreachable: ${error.message}`);

    return null;
  });
  const state = await sync.state();
  const at = Option.match(state, {
    onNone: () => null,
    onSome: row => row.indexedVersion
  });

  if (head !== null && head !== at) await sync.request();
}
