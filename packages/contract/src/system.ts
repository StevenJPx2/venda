import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';

/** Liveness and the running build, for monitors and the CLI's `doctor`. */
export class HealthStatus extends Schema.Class<HealthStatus>('venda/contract/HealthStatus')({
  ok: Schema.Literal(true),
  version: Schema.String
}) {}

// Top level: the typed client calls it as `client.health()`.
export class SystemApi extends HttpApiGroup.make('system', { topLevel: true }).add(
  HttpApiEndpoint.get('health', '/health', { success: HealthStatus })
) {}
