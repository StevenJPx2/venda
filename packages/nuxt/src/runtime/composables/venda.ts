import { toValue, type MaybeRefOrGetter } from 'vue';
import { useAsyncData, useRuntimeConfig } from '#imports';
import type { VendaCollectionOptions, VendaEntry } from '../types';
import { collectionKey, contentUrl, isNotFound, shapeEntries } from '../utils';

function useApiBase(): string {
  const apiBase = useRuntimeConfig().public.venda?.apiBase;

  if (!apiBase) throw new Error('[@venda/nuxt] Missing `venda.apiBase`. Set it in nuxt.config or NUXT_PUBLIC_VENDA_API_BASE.');

  return apiBase;
}

/**
 * Low-level fetchers for use outside components (server routes, plugins, custom
 * `useAsyncData` calls). Missing collections/entries reject with a 404 error.
 */
export function useVenda() {
  const apiBase = useApiBase();

  return {
    list: <TData = Record<string, unknown>>(collection: string) =>
      $fetch<VendaEntry<TData>[]>(contentUrl(apiBase, collection)),
    get: <TData = Record<string, unknown>>(collection: string, slug: string) =>
      $fetch<VendaEntry<TData>>(contentUrl(apiBase, collection, slug))
  };
}

/**
 * Published entries of a collection. SSR-safe; `data` defaults to `[]` and a
 * missing collection is reported through `error`.
 */
export function useVendaCollection<TData = Record<string, unknown>>(
  collection: MaybeRefOrGetter<string>,
  options: VendaCollectionOptions<TData> = {}
) {
  const { list } = useVenda();

  return useAsyncData(
    () => collectionKey(toValue(collection), options),
    async () => shapeEntries(await list<TData>(toValue(collection)), options),
    { default: () => [] as VendaEntry<TData>[] }
  );
}

/**
 * A single published entry. Resolves to `null` when the entry does not exist
 * or is a draft, so pages can render a 404; other failures surface on `error`.
 */
export function useVendaEntry<TData = Record<string, unknown>>(
  collection: MaybeRefOrGetter<string>,
  slug: MaybeRefOrGetter<string>
) {
  const { get } = useVenda();

  return useAsyncData(
    () => `venda:${toValue(collection)}/${toValue(slug)}`,
    async () => {
      try {
        return await get<TData>(toValue(collection), toValue(slug));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    { default: () => null }
  );
}
