import { addComponent, addImports, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit';

export interface ModuleOptions {
  /** Base URL of the Venda API, e.g. `https://api.example.com/api`. Overridable at runtime with `NUXT_PUBLIC_VENDA_API_BASE`. */
  apiBase: string;
}

export interface ModulePublicRuntimeConfig {
  venda: { apiBase: string };
}

export type { VendaCollectionOptions, VendaEntry } from './runtime/types';

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@venda/nuxt',
    configKey: 'venda',
    compatibility: { nuxt: '>=4.0.0' }
  },
  defaults: {
    apiBase: ''
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const logger = useLogger('@venda/nuxt');

    const configured = (nuxt.options.runtimeConfig.public.venda as { apiBase?: string } | undefined)?.apiBase;
    const apiBase = (configured || options.apiBase).replace(/\/+$/, '');

    nuxt.options.runtimeConfig.public.venda = { apiBase };

    // `nuxt prepare` (e.g. postinstall) only generates types, so stay quiet there.
    if (!apiBase && !nuxt.options._prepare) logger.warn('`venda.apiBase` is not set; content requests will fail until NUXT_PUBLIC_VENDA_API_BASE is provided.');

    const composables = resolve('./runtime/composables/venda');
    addImports(['useVenda', 'useVendaCollection', 'useVendaEntry'].map(name => ({ name, from: composables })));

    addComponent({ name: 'VendaContent', filePath: resolve('./runtime/components/VendaContent') });
  }
});
