// The Effect HttpApi side of the server: endpoints that have moved to
// @venda/contract. Every other path still goes to the legacy core.
import { HealthStatus, VendaApi } from '@venda/contract';
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

/** Paths the contract defines, so the server knows which requests are Effect's. */
export const contractPaths: ReadonlySet<string> = new Set(Object.keys(OpenApi.fromApi(VendaApi).paths));

/** The contract's routes; the composition root provides `BuildInfo`. */
const ApiRoutes = HttpApiBuilder.layer(VendaApi).pipe(
  Layer.provide(SystemHandlers),
  Layer.provide(HttpServer.layerServices)
);

/** A Web `fetch` handler for the routes, for hosts that are not Effect programs. */
export const toApiHandler = (build: Layer.Layer<BuildInfo>) => HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(build)));
