export type EntryStatus = 'draft' | 'published';

export interface Collection {
  id: string;
  name: string;
  slug: string;
  schema: Record<string, unknown>;
}

export interface Entry {
  id: string;
  collectionId: string;
  slug: string;
  data: Record<string, unknown>;
  status: EntryStatus;
  updatedAt: string;
}

export interface Media {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}
