import { HttpApi, OpenApi } from 'effect/http-api';
import { AdminContentApi } from './admin-content';
import { AuthApi, InvitationsApi, TokensApi, UsersApi } from './auth';
import { ContentApi } from './content';
import { SystemApi } from './system';

export * from './auth';

export * from './admin-content';

export {
  CollectionNotFound,
  ContentApi,
  EntryNotFound,
  PublicEntry,
  SiteSettings
} from './content';

export { HealthStatus, SystemApi } from './system';

/** The Venda HTTP API; each slice adds its group (docs/architecture.md). */
export class VendaApi extends HttpApi.make('venda')
  .add(SystemApi)
  .add(ContentApi)
  .add(AuthApi)
  .add(UsersApi)
  .add(InvitationsApi)
  .add(TokensApi)
  .add(AdminContentApi)
  .prefix('/api')
  .annotateMerge(OpenApi.annotations({ title: 'Venda API' })) {}
