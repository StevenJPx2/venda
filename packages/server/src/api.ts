// The HTTP API: @venda/contract's endpoints, implemented by the core.
import { HealthStatus, VendaApi } from '@venda/contract';
import { getPublished, IndexDb, listPublished } from '@venda/core/content';
import { Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

export class BuildInfo extends Context.Service<BuildInfo, { readonly version: string }>()('venda/server/BuildInfo') {}

const SystemHandlers = HttpApiBuilder.group(
  VendaApi,
  'system',
  Effect.fn(function*(handlers) {
    const { version } = yield* BuildInfo;

    return handlers.handleAll({
      health: () => Effect.succeed(new HealthStatus({ ok: true, version }))
    });
  })
);

const ContentHandlers = HttpApiBuilder.group(
  VendaApi,
  'content',
  Effect.fn(function*(handlers) {
    const db = yield* IndexDb;

    // A failing index query is a server error, not a missing entry.
    return handlers.handleAll({
      list: ({ params }) => listPublished(params.collection).pipe(Effect.catchTag('EffectDrizzleQueryError', Effect.die), Effect.provideService(IndexDb, db)),
      get: ({ params }) => getPublished(params.collection, params.slug).pipe(Effect.catchTag('EffectDrizzleQueryError', Effect.die), Effect.provideService(IndexDb, db))
    });
  })
);

/** The contract's routes; the composition root provides `BuildInfo` and `IndexDb`. */
const ApiRoutes = HttpApiBuilder.layer(VendaApi).pipe(
  Layer.provide([SystemHandlers, ContentHandlers]),
  Layer.provide(HttpServer.layerServices)
);

/** A Web `fetch` handler for the routes, for hosts that are not Effect programs. */
export const toApiHandler = (services: Layer.Layer<BuildInfo | IndexDb>) => HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(services)));
