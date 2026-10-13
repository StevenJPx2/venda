// Cloudflare Workers: the D1 binding named in nitro.config.ts, which holds the
// content as well as everything else.
import { D1Client } from '@effect/sql-d1';
import { Database } from '@venda/core/database';
import { env } from 'cloudflare:workers';
import * as D1Drizzle from 'drizzle-orm/effect-d1';
import { Effect, Layer, Predicate, Schema } from 'effect';
import type { Target } from './target';

const D1Binding = Schema.declare(
  (value: unknown): value is D1Database =>
    Predicate.isObject(value) &&
    Predicate.isFunction(value.prepare) &&
    Predicate.isFunction(value.batch)
);

// A missing or misnamed binding fails the build of the app, with the reason.
const decodeBindings = Schema.decodeUnknownEffect(
  Schema.Struct({ VENDA_DB: D1Binding })
);

const client = Layer.unwrap(
  Effect.map(decodeBindings(env), ({ VENDA_DB }) =>
    D1Client.layer({ db: VENDA_DB })
  )
);

export const target: Target = {
  database: {
    layer: Layer.provideMerge(
      Layer.effect(Database, D1Drizzle.makeWithDefaults({})),
      client
    ),
    atomically: statements =>
      Effect.flatMap(D1Client.D1Client, d1 =>
        Effect.asVoid(d1.batch(statements))
      )
  }
};
