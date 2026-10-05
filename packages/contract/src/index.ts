import { HttpApi, OpenApi } from 'effect/http-api';
import { ContentApi } from './content';
import { SystemApi } from './system';

export { CollectionNotFound, ContentApi, EntryNotFound, PublicEntry } from './content';

export { HealthStatus, SystemApi } from './system';

/**
 * The Venda HTTP API. Groups move here from the legacy core one slice at a
 * time (docs/architecture.md); until then the server sends every other path
 * to the legacy handler.
 */
export class VendaApi extends HttpApi.make('venda')
  .add(SystemApi)
  .add(ContentApi)
  .prefix('/api')
  .annotateMerge(OpenApi.annotations({ title: 'Venda API' })) {}
