import type { Media } from '~/types';

const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads a file to R2 through the API and returns its public URL. */
export function useMediaUpload() {
  const { api } = useVendaApi();
  const apiBase = useRuntimeConfig().public.apiBase;

  async function upload(file: File): Promise<string> {
    if (file.size > MAX_BYTES) throw new Error('Files must be 10 MB or smaller.');

    const form = new FormData();
    form.append('file', file);
    const media = await api<Media>('/media', { method: 'POST', body: form });

    return `${apiBase}/media/${encodeURIComponent(media.key)}`;
  }

  /** Opens the native file picker; resolves null if the user cancels. */
  function pick(accept = 'image/*'): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }

  return { upload, pick };
}
