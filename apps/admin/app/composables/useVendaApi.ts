type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: HeadersInit;
  body?: BodyInit;
};

export function useVendaApi() {
  const config = useRuntimeConfig();

  async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
    return $fetch<T>(`${config.public.apiBase}${path}`, {
      credentials: 'include',
      ...options
    });
  }

  return { api };
}
