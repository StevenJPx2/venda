import type { Capability, User } from '~/types';

interface MeResponse { email: string | null; user: User | null; capabilities?: Capability[] }

/**
 * The signed-in user and what they may do. The session cookie belongs to the
 * API origin, so it can only be checked from the browser; signed-out users
 * are sent to the sign-in page.
 */
export function useAdminSession() {
  const { api } = useVendaApi();
  const user = useState<User | null>('venda-session-user', () => null);
  const capabilities = useState<Capability[]>('venda-session-capabilities', () => []);
  const email = computed(() => user.value?.email ?? null);

  async function refresh(): Promise<User | null> {
    try {
      const me = await api<MeResponse>('/auth/me');
      user.value = me.user;
      capabilities.value = me.capabilities ?? [];
    } catch {
      user.value = null;
      capabilities.value = [];
    }

    return user.value;
  }

  async function ensure(): Promise<boolean> {
    const current = await refresh();

    if (!current) await navigateTo('/');

    return Boolean(current);
  }

  const can = (capability: Capability): boolean => capabilities.value.includes(capability);

  /** Whether the user may take a scoped action on content owned by `ownerId`. */
  function canOn(action: 'edit' | 'publish' | 'delete', ownerId: string | null): boolean {
    return can(`content:${action}:any`) || (can(`content:${action}:own`) && ownerId === user.value?.id);
  }

  return { user, email, capabilities, can, canOn, refresh, ensure };
}
