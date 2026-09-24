/**
 * Client-side guard for admin routes. The session cookie belongs to the API
 * origin, so it can only be checked from the browser; unauthenticated users
 * are sent to the sign-in page.
 */
export function useAdminSession() {
  const { api } = useVendaApi();
  const email = useState<string | null>('venda-session-email', () => null);

  async function ensure(): Promise<boolean> {
    try {
      const result = await api<{ email: string | null }>('/auth/me');
      email.value = result.email;
    } catch {
      email.value = null;
    }

    if (!email.value) await navigateTo('/');
    return Boolean(email.value);
  }

  return { email, ensure };
}
