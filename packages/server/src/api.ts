// The HTTP API: @venda/contract's endpoints, implemented by the core.
import { HealthStatus, VendaApi } from '@venda/contract';
import { getPublished, listPublished } from '@venda/core/content';
import { Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { AuthenticationLive, AuthHandlers, InvitationsHandlers, TokensHandlers, UsersHandlers } from './api/accounts';
import { domainRunner, type DomainServices } from './infrastructure';

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
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: ({ params }) => run(listPublished(params.collection)),
      get: ({ params }) => run(getPublished(params.collection, params.slug))
    });
  })
);

/** The contract's routes; the composition root provides `BuildInfo` and the domain services. */
const ApiRoutes = HttpApiBuilder.layer(VendaApi).pipe(
  Layer.provide([SystemHandlers, ContentHandlers, AuthHandlers, UsersHandlers, InvitationsHandlers, TokensHandlers]),
  Layer.provide(AuthenticationLive),
  Layer.provide(HttpServer.layerServices)
);

/** A Web `fetch` handler for the routes, for hosts that are not Effect programs. */
export const toApiHandler = (services: Layer.Layer<BuildInfo | DomainServices>) => HttpRouter.toWebHandler(ApiRoutes.pipe(Layer.provide(services)));
