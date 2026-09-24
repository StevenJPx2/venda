export interface Env {
  VENDA_DB: D1Database;
  VENDA_MEDIA: R2Bucket;
  VENDA_CACHE: KVNamespace;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  /** Admin SPA assets, present when the admin is served from this Worker. */
  ASSETS?: Fetcher;
  /** Comma-separated origins allowed to call admin endpoints cross-origin. */
  ADMIN_ORIGINS?: string;
  /** Venda release, set by the CLI; reported by /api/health. */
  VENDA_VERSION?: string;
}

import type { CollectionSchema } from '@venda/schema';

export type Status = 'draft' | 'published';

export interface Collection { id: string; name: string; slug: string; schema: CollectionSchema; createdAt: string; updatedAt: string }
export interface Entry { id: string; collectionId: string; slug: string; data: Record<string, unknown>; status: Status; createdAt: string; updatedAt: string }
