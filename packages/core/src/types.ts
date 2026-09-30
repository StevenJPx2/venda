import type { CollectionSchema } from '@venda/schema';

export type Status = 'draft' | 'published';

export interface Collection { id: string; name: string; slug: string; schema: CollectionSchema; createdAt: string; updatedAt: string }

/** An entry as editors see it: the working copy plus its publication state. */
export interface Entry {
  id: string;
  collectionId: string;
  slug: string;
  /** The working copy, which editors change and autosave. */
  data: Record<string, unknown>;
  status: Status;
  /** True when the working copy differs from what is published. */
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  /** When a scheduled publish will run. */
  publishAt: string | null;
  /** When a scheduled unpublish will run. */
  unpublishAt: string | null;
  /** Why the last scheduled publish could not run, if it failed. */
  scheduleError: string | null;
  /** Set while the entry is in the trash. */
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A published entry as the public content API returns it. */
export interface PublicEntry {
  id: string;
  collectionId: string;
  slug: string;
  data: Record<string, unknown>;
  status: 'published';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RevisionReason = 'save' | 'publish' | 'restore';

export interface Revision {
  id: string;
  entryId: string;
  slug: string;
  data: Record<string, unknown>;
  reason: RevisionReason;
  createdBy: string | null;
  createdAt: string;
}
