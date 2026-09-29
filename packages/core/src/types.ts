import type { CollectionSchema } from '@venda/schema';

export type Status = 'draft' | 'published';

export interface Collection { id: string; name: string; slug: string; schema: CollectionSchema; createdAt: string; updatedAt: string }
export interface Entry { id: string; collectionId: string; slug: string; data: Record<string, unknown>; status: Status; createdAt: string; updatedAt: string }
