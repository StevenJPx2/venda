export const ROLES = ['administrator', 'editor', 'author', 'contributor'] as const;
export type Role = typeof ROLES[number];

export const CAPABILITIES = [
  'content:read',
  'content:create',
  'content:edit:own',
  'content:edit:any',
  'content:publish:own',
  'content:publish:any',
  'content:delete:own',
  'content:delete:any',
  'media:upload',
  'media:delete:own',
  'media:delete:any',
  'schema:manage',
  'users:manage'
] as const;
export type Capability = typeof CAPABILITIES[number];

const EDITOR: readonly Capability[] = [
  'content:read', 'content:create', 'content:edit:own', 'content:edit:any', 'content:publish:own', 'content:publish:any',
  'content:delete:own', 'content:delete:any', 'media:upload', 'media:delete:own', 'media:delete:any'
];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  administrator: CAPABILITIES,
  editor: EDITOR,
  author: ['content:read', 'content:create', 'content:edit:own', 'content:publish:own', 'content:delete:own', 'media:upload', 'media:delete:own'],
  contributor: ['content:read', 'content:create', 'content:edit:own', 'content:delete:own']
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
}

export function roleCapabilities(role: Role): Set<Capability> {
  return new Set(ROLE_CAPABILITIES[role]);
}

/** An action a user may take on everything (`any`) or only on what they own (`own`). */
export interface ScopedAction { own: Capability; any: Capability }

export const EDIT: ScopedAction = { own: 'content:edit:own', any: 'content:edit:any' };
export const PUBLISH: ScopedAction = { own: 'content:publish:own', any: 'content:publish:any' };
export const DELETE_CONTENT: ScopedAction = { own: 'content:delete:own', any: 'content:delete:any' };
export const DELETE_MEDIA: ScopedAction = { own: 'media:delete:own', any: 'media:delete:any' };

export function allows(capabilities: ReadonlySet<Capability>, action: ScopedAction, ownerId: string | null, userId: string): boolean {
  return capabilities.has(action.any) || (capabilities.has(action.own) && ownerId === userId);
}
