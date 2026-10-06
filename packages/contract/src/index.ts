import { HttpApi, OpenApi } from 'effect/http-api';
import { ContentApi } from './content';
import { SystemApi } from './system';

export { CollectionNotFound, ContentApi, EntryNotFound, PublicEntry } from './content';

export { HealthStatus, SystemApi } from './system';

/** The Venda HTTP API; each slice adds its group (docs/architecture.md). */
export class VendaApi extends HttpApi.make('venda')
  .add(SystemApi)
  .add(ContentApi)
  .prefix('/api')
  .annotateMerge(OpenApi.annotations({ title: 'Venda API' })) {}
