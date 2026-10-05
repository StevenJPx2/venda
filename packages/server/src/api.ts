// The Effect HttpApi side of the server: endpoints that have moved to
// @venda/contract. Every other path still goes to the legacy core.
import { HealthStatus, VendaApi } from '@venda/contract';
import { getPublished, IndexDb, listPublished } from '@venda/core/content';
import { Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder, OpenApi } from 'effect/http-api';

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

    // An unreachable index is a server error, not a missing entry.
    return handlers.handleAll({
      list: ({ params }) => listPublished(params.collection).pipe(Effect.catchTag('IndexDbError', Effect.die), Effect.provideService(IndexDb, db)),
      get: ({ params }) => getPublished(params.collection, params.slug).pipe(Effect.catchTag('IndexDbError', Effect.die), Effect.provideService(IndexDb, db))
    });
  })
);

// `/api/content/{collection}` matches `/api/content/blog`, one path segment per parameter.
const pattern = (path: string) => new RegExp(`^${path.replaceAll(/\{[^}]+\}/g, '[^/]+')}$`);

const patterns = Object.keys(OpenApi.fromApi(VendaApi).paths).map(pattern);

/** Whether the contract defines this path, so the server knows which requests are Effect's. */
export const isContractPath = (path: string): boolean => patterns.some(each => each.test(path));

/** The contract's routes; the composition root provides `BuildInfo` and `IndexDb`. */
const ApiRoutes = HttpApiBuilder.layer(VendaApi).pipe(
  Layer.provide([SystemHandlers, ContentHandlers]),
  Layer.provide(HttpServer.layerServices)
);

/** A Web `fetch` handler for the routes, for hosts that are not Effect programs. */
export const toApiHandler = (services: Layer.Layer<BuildInfo | IndexDb>) => HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(services)));
