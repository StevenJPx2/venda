export interface Env {
  VENDA_DB: D1Database;
  VENDA_MEDIA: R2Bucket;
  VENDA_CACHE: KVNamespace;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

export type Status = 'draft' | 'published';

export interface Collection { id: string; name: string; slug: string; schema: Record<string, unknown>; createdAt: string; updatedAt: string }
export interface Entry { id: string; collectionId: string; slug: string; data: Record<string, unknown>; status: Status; createdAt: string; updatedAt: string }
