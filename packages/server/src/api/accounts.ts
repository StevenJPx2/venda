// Accounts over HTTP. Handlers name the values a request acts on, obtain the
// proofs the core demands, and call it; the checks live here, in the handler
// body, so each proof reaches the function that needs it.
import { name } from '@gdp-ts/core';
import {
  Authentication,
  CurrentActor,
  Forbidden,
  SessionCookie,
  Unauthenticated,
  VendaApi
} from '@venda/contract';
import {
  acceptInvitation,
  actorFromSession,
  actorFromToken,
  changePassword,
  createInvitation,
  createToken,
  endSession,
  invitationIsOpen,
  isAdministrator,
  listInvitations,
  listTokens,
  listUsers,
  me,
  ownsToken,
  passwordConfirmed,
  previewInvitation,
  revokeInvitation,
  revokeToken,
  SESSION_TTL_SECONDS,
  signedInInPerson,
  signIn,
  updateUser
} from '@venda/core/auth';
import { Effect, Layer, Redacted } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { domainRunner } from '../infrastructure';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookies ride along on cross-site requests; a browser always says where a
 * request came from. A changing request whose Origin is another site is refused.
 */
const sameOrigin = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const origin = request.headers.origin;

  if (SAFE_METHODS.has(request.method) || origin === undefined) return;
  if (URL.canParse(origin) && new URL(origin).host === request.headers.host)
    return;

  return yield* new Forbidden({
    reason: 'Cross-site requests cannot use the session cookie'
  });
});

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const run = yield* domainRunner;

    return Authentication.of({
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          yield* sameOrigin;

          const actor = yield* run(
            actorFromSession(Redacted.value(credential))
          );

          return yield* Effect.provideService(httpEffect, CurrentActor, actor);
        }),
      token: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const secret = Redacted.value(credential);

          if (secret === '') return yield* new Unauthenticated();

          return yield* Effect.provideService(
            httpEffect,
            CurrentActor,
            yield* run(actorFromToken(secret))
          );
        })
    });
  })
);

const setSession = (secret: string) =>
  HttpApiBuilder.securitySetCookie(SessionCookie, secret, {
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });

const clearSession = HttpApiBuilder.securitySetCookie(SessionCookie, '', {
  sameSite: 'lax',
  path: '/',
  maxAge: 0
});

export const AuthHandlers = HttpApiBuilder.group(
  VendaApi,
  'auth',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      signIn: ({ payload }) =>
        Effect.gen(function* () {
          const { user, secret } = yield* run(
            signIn(payload.email, payload.password)
          );

          yield* setSession(secret);

          return user;
        }),
      signOut: () =>
        Effect.gen(function* () {
          const secret = Redacted.value(
            yield* HttpApiBuilder.securityDecode(SessionCookie)
          );

          if (secret !== '') yield* run(endSession(secret));

          yield* clearSession;
        }),
      me: () =>
        Effect.flatMap(CurrentActor, actor =>
          run(name(actor.userId, user => me(user)))
        ),
      changePassword: ({ payload }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;

          const secret = yield* run(
            name(actor.userId, user =>
              Effect.gen(function* () {
                const inPerson = yield* signedInInPerson(user, actor);
                const confirmed = yield* passwordConfirmed(
                  user,
                  payload.current,
                  inPerson
                );

                return yield* changePassword(user, payload.next, confirmed);
              })
            )
          );

          yield* setSession(secret);
        })
    });
  })
);

export const UsersHandlers = HttpApiBuilder.group(
  VendaApi,
  'users',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: () =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, admin =>
              Effect.flatMap(isAdministrator(admin), listUsers)
            )
          )
        ),
      update: ({ params, payload }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, params.id, (admin, target) =>
              Effect.flatMap(isAdministrator(admin), proof =>
                updateUser(target, payload, proof)
              )
            )
          )
        )
    });
  })
);

export const InvitationsHandlers = HttpApiBuilder.group(
  VendaApi,
  'invitations',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: () =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, admin =>
              Effect.flatMap(isAdministrator(admin), listInvitations)
            )
          )
        ),
      create: ({ payload }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, admin =>
              Effect.flatMap(isAdministrator(admin), proof =>
                createInvitation(admin, payload, proof)
              )
            )
          )
        ),
      revoke: ({ params }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, admin =>
              Effect.flatMap(isAdministrator(admin), proof =>
                revokeInvitation(params.id, proof)
              )
            )
          )
        ),
      preview: ({ params }) =>
        run(
          name(params.token, secret =>
            Effect.flatMap(invitationIsOpen(secret), open =>
              previewInvitation(secret, open)
            )
          )
        ),
      accept: ({ params, payload }) =>
        run(
          name(params.token, secret =>
            Effect.flatMap(invitationIsOpen(secret), open =>
              acceptInvitation(secret, payload, open)
            )
          )
        )
    });
  })
);

export const TokensHandlers = HttpApiBuilder.group(
  VendaApi,
  'tokens',
  Effect.fn(function* (handlers) {
    const run = yield* domainRunner;

    return handlers.handleAll({
      list: () =>
        Effect.flatMap(CurrentActor, actor =>
          run(name(actor.userId, user => listTokens(user)))
        ),
      create: ({ payload }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, user =>
              Effect.flatMap(signedInInPerson(user, actor), proof =>
                createToken(user, payload.name, proof)
              )
            )
          )
        ),
      revoke: ({ params }) =>
        Effect.flatMap(CurrentActor, actor =>
          run(
            name(actor.userId, params.id, (user, token) =>
              Effect.flatMap(ownsToken(user, token), proof =>
                revokeToken(token, proof)
              )
            )
          )
        )
    });
  })
);
