// The same-origin admin shell; its screens are build-time plugins. The static
// build is served by @venda/server, never by a second admin server in production.
export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/main.css'],
  ssr: false,
  app: { baseURL: '/admin/' },
  nitro: { output: { publicDir: 'dist' } },
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
