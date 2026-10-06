// The admin, rebuilt as a plugin-built shell in slice 6 (docs/architecture.md).
// Until then it holds only the Focus editor prototype that slice promotes.
export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/main.css'],
  routeRules: { '/': { redirect: '/prototypes/editor' } },
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
