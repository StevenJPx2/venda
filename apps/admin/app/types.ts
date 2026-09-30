import type { CollectionSchema } from '@venda/schema';

export type EntryStatus = 'draft' | 'published';

export interface Collection {
  id: string;
  name: string;
  slug: string;
  schema: CollectionSchema;
}

export interface Entry {
  id: string;
  collectionId: string;
  slug: string;
  data: Record<string, unknown>;
  status: EntryStatus;
  /** True when the working copy differs from what is published. */
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  publishAt: string | null;
  unpublishAt: string | null;
  scheduleError: string | null;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Revision {
  id: string;
  entryId: string;
  slug: string;
  data: Record<string, unknown>;
  reason: 'save' | 'publish' | 'restore';
  createdBy: string | null;
  createdAt: string;
}

export interface Media {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export const ROLES = ['administrator', 'editor', 'author', 'contributor'] as const;
export type Role = typeof ROLES[number];

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  administrator: { label: 'Administrator', description: 'Everything, including users and data models' },
  editor: { label: 'Editor', description: 'Writes, edits and publishes all content' },
  author: { label: 'Author', description: 'Writes and publishes their own content' },
  contributor: { label: 'Contributor', description: 'Writes drafts for others to publish' }
};

/** Mirrors the API's capability names; see @venda/core auth/permissions. */
export type Capability =
  | 'content:read' | 'content:create' | 'content:edit:own' | 'content:edit:any'
  | 'content:publish:own' | 'content:publish:any' | 'content:delete:own' | 'content:delete:any'
  | 'media:upload' | 'media:delete:own' | 'media:delete:any' | 'schema:manage' | 'users:manage';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
}

export interface ApiToken {
  id: string;
  name: string;
  scopes: Capability[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}
