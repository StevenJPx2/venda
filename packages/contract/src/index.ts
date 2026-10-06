import { HttpApi, OpenApi } from 'effect/http-api';
import { AuthApi, InvitationsApi, TokensApi, UsersApi } from './auth';
import { ContentApi } from './content';
import { SystemApi } from './system';

export * from './auth';

export { CollectionNotFound, ContentApi, EntryNotFound, PublicEntry } from './content';

export { HealthStatus, SystemApi } from './system';

/** The Venda HTTP API; each slice adds its group (docs/architecture.md). */
export class VendaApi extends HttpApi.make('venda')
  .add(SystemApi)
  .add(ContentApi)
  .add(AuthApi)
  .add(UsersApi)
  .add(InvitationsApi)
  .add(TokensApi)
  .prefix('/api')
  .annotateMerge(OpenApi.annotations({ title: 'Venda API' })) {}
