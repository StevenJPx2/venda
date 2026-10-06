// The services the core's domain code needs from the host, and how a handler
// runs domain code: infrastructure failures (a failing query, an unreachable
// key-value store) are server errors, never a domain answer like "not found".
import { KeyValue, Owner } from '@venda/core/auth';
import { Database } from '@venda/core/database';
import { Context, Effect } from 'effect';

export type DomainServices = Database | KeyValue | Owner;

/** Captures the domain services once, so handlers can run domain effects with them. */
export const domainRunner = Effect.map(Effect.context<DomainServices>(), services => <A, E, R extends DomainServices>(effect: Effect.Effect<A, E, R>) => effect.pipe(
  Effect.catchTags({ EffectDrizzleQueryError: Effect.die, KeyValueError: Effect.die }),
  Effect.provideContext(Context.pick(Database, KeyValue, Owner)(services))
));
