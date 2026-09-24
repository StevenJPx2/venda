// Two build targets:
// - default: SSR admin on its own Worker, talking to the API on another origin
//   (the hosted venda.stevenjohn.co deployment).
// - VENDA_ADMIN_TARGET=static: a client-only SPA bundled into the API Worker by
//   the `venda` CLI, so a self-hosted install is one Worker on one origin and
//   calls the API relatively at /api.
const selfHosted = process.env.VENDA_ADMIN_TARGET === 'static';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/main.css'],
  ssr: !selfHosted,
  runtimeConfig: {
    public: { apiBase: process.env.NUXT_PUBLIC_API_BASE || (selfHosted ? '/api' : 'http://localhost:8787/api') }
  },
  nitro: { preset: selfHosted ? 'static' : 'cloudflare_module' },
  // The session cookie belongs to the API origin, so authenticated screens can
  // only be rendered in the browser.
  routeRules: {
    '/editor/**': { ssr: false },
    '/collections/**': { ssr: false }
  },
  // Pre-bundle ProseMirror so UEditor never loads two copies of a keyed plugin
  // (recommended by the Nuxt UI Editor docs).
  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor'
      ]
    }
  },
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
    }
  },
  typescript: { strict: true, typeCheck: true }
});
