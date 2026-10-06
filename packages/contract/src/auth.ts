// Accounts: signing in, the people on an install, invitations and API tokens.
import { Context, Schema } from 'effect';
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity
} from 'effect/http-api';

export const UserId = Schema.String.pipe(Schema.brand('UserId'));

export type UserId = typeof UserId.Type;

export const InvitationId = Schema.String.pipe(Schema.brand('InvitationId'));

export type InvitationId = typeof InvitationId.Type;

export const TokenId = Schema.String.pipe(Schema.brand('TokenId'));

export type TokenId = typeof TokenId.Type;

/**
 * What a person may do. Administrators manage people, models and settings;
 * editors publish anyone's entries; authors publish their own; contributors
 * write drafts for others to publish.
 */
export const Role = Schema.Literals([
  'administrator',
  'editor',
  'author',
  'contributor'
]);

export type Role = typeof Role.Type;

export const UserStatus = Schema.Literals(['active', 'disabled']);

const Email = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      expected: 'an email address'
    })
  )
);

const NewPassword = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(10, { expected: 'at least 10 characters' }),
    Schema.isMaxLength(200)
  )
);

const DisplayName = Schema.String.pipe(Schema.check(Schema.isMaxLength(120)));

/** A person on this install. */
export class User extends Schema.Class<User>('venda/contract/User')({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  role: Role,
  status: UserStatus,
  createdAt: Schema.String
}) {}

/** An open invitation; the link it was sent with is shown only when it is created. */
export class Invitation extends Schema.Class<Invitation>(
  'venda/contract/Invitation'
)({
  id: InvitationId,
  email: Schema.String,
  role: Role,
  expiresAt: Schema.String
}) {}

export class CreatedInvitation extends Schema.Class<CreatedInvitation>(
  'venda/contract/CreatedInvitation'
)({
  invitation: Invitation,
  // The secret for the join link; stored only as a hash.
  token: Schema.String
}) {}

/** What someone opening a join link sees before accepting. */
export class InvitationPreview extends Schema.Class<InvitationPreview>(
  'venda/contract/InvitationPreview'
)({
  email: Schema.String,
  role: Role
}) {}

export class ApiToken extends Schema.Class<ApiToken>('venda/contract/ApiToken')(
  {
    id: TokenId,
    name: Schema.String,
    createdAt: Schema.String,
    lastUsedAt: Schema.NullOr(Schema.String)
  }
) {}

export class CreatedToken extends Schema.Class<CreatedToken>(
  'venda/contract/CreatedToken'
)({
  token: ApiToken,
  // The secret, shown once; send it as `Authorization: Bearer <secret>`.
  secret: Schema.String
}) {}

export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()(
  'Unauthenticated',
  {},
  { httpApiStatus: 401 }
) {}

/** Wrong email or password; deliberately does not say which. */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  'InvalidCredentials',
  {},
  { httpApiStatus: 401 }
) {}

export class TooManyAttempts extends Schema.TaggedError<TooManyAttempts>()(
  'TooManyAttempts',
  {
    retryAfterSeconds: Schema.Number
  },
  { httpApiStatus: 429 }
) {}

/** Signed in, but this needs a capability the caller does not have. */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  'Forbidden',
  {
    reason: Schema.String
  },
  { httpApiStatus: 403 }
) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  'UserNotFound',
  {},
  { httpApiStatus: 404 }
) {}

/** The join link is unknown, expired, revoked or already used. */
export class InvitationNotFound extends Schema.TaggedError<InvitationNotFound>()(
  'InvitationNotFound',
  {},
  { httpApiStatus: 404 }
) {}

export class TokenNotFound extends Schema.TaggedError<TokenNotFound>()(
  'TokenNotFound',
  {},
  { httpApiStatus: 404 }
) {}

export class EmailTaken extends Schema.TaggedError<EmailTaken>()(
  'EmailTaken',
  {},
  { httpApiStatus: 409 }
) {}

/** The change would leave no active administrator. */
export class LastAdministrator extends Schema.TaggedError<LastAdministrator>()(
  'LastAdministrator',
  {},
  { httpApiStatus: 409 }
) {}

/** Who is making the request, and how they proved it. */
export class Actor extends Schema.Class<Actor>('venda/contract/Actor')({
  userId: UserId,
  role: Role,
  via: Schema.Literals(['session', 'token'])
}) {}

export class CurrentActor extends Context.Service<CurrentActor, Actor>()(
  'venda/contract/CurrentActor'
) {}

/** The session cookie the admin uses; scripts and CI send an API token as a bearer credential instead. */
export const SessionCookie = HttpApiSecurity.apiKey({
  in: 'cookie',
  key: 'venda_session'
});

// HttpApi middleware runs inside a request by design, so its methods see the
// request's services; nothing outside the HTTP layer can call them.
// @effect-diagnostics-next-line leakingRequirements:off
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentActor; requires: never }
>()('venda/contract/Authentication', {
  // Tried in order and the last failure is reported: a request with no token
  // falls through to the session, whose reason (such as a cross-site request) is the answer.
  security: { token: HttpApiSecurity.bearer, session: SessionCookie },
  error: [Unauthenticated, Forbidden]
}) {}

const Credentials = Schema.Struct({
  email: Schema.String,
  password: Schema.String
});

export class AuthApi extends HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.post('signIn', '/auth/sign-in', {
      payload: Credentials,
      success: User,
      error: [InvalidCredentials, TooManyAttempts]
    })
  )
  .add(
    HttpApiEndpoint.post('signOut', '/auth/sign-out', {
      success: HttpApiSchema.NoContent
    }).middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.get('me', '/auth/me', { success: User }).middleware(
      Authentication
    )
  )
  .add(
    HttpApiEndpoint.post('changePassword', '/auth/password', {
      payload: Schema.Struct({ current: Schema.String, next: NewPassword }),
      success: HttpApiSchema.NoContent,
      error: [InvalidCredentials, TooManyAttempts]
    }).middleware(Authentication)
  ) {}

export class UsersApi extends HttpApiGroup.make('users')
  .add(HttpApiEndpoint.get('list', '/users', { success: Schema.Array(User) }))
  .add(
    HttpApiEndpoint.patch('update', '/users/:id', {
      params: { id: UserId },
      payload: Schema.Struct({
        role: Schema.optional(Role),
        status: Schema.optional(UserStatus),
        name: Schema.optional(DisplayName)
      }),
      success: User,
      error: [UserNotFound, LastAdministrator]
    })
  )
  .middleware(Authentication) {}

export class InvitationsApi extends HttpApiGroup.make('invitations')
  .add(
    HttpApiEndpoint.get('list', '/invitations', {
      success: Schema.Array(Invitation)
    }).middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.post('create', '/invitations', {
      payload: Schema.Struct({ email: Email, role: Role }),
      success: CreatedInvitation,
      error: EmailTaken
    }).middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.delete('revoke', '/invitations/:id', {
      params: { id: InvitationId },
      success: HttpApiSchema.NoContent,
      error: InvitationNotFound
    }).middleware(Authentication)
  )
  // Public: whoever holds the link may see what it is for, and accept it once.
  .add(
    HttpApiEndpoint.get('preview', '/join/:token', {
      params: { token: Schema.String },
      success: InvitationPreview,
      error: InvitationNotFound
    })
  )
  .add(
    HttpApiEndpoint.post('accept', '/join/:token', {
      params: { token: Schema.String },
      payload: Schema.Struct({ name: DisplayName, password: NewPassword }),
      success: User,
      error: [InvitationNotFound, EmailTaken]
    })
  ) {}

export class TokensApi extends HttpApiGroup.make('tokens')
  .add(
    HttpApiEndpoint.get('list', '/tokens', { success: Schema.Array(ApiToken) })
  )
  .add(
    HttpApiEndpoint.post('create', '/tokens', {
      payload: Schema.Struct({
        name: DisplayName.pipe(Schema.check(Schema.isMinLength(1)))
      }),
      success: CreatedToken
    })
  )
  .add(
    HttpApiEndpoint.delete('revoke', '/tokens/:id', {
      params: { id: TokenId },
      success: HttpApiSchema.NoContent,
      error: TokenNotFound
    })
  )
  .middleware(Authentication) {}
