export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint', '@venda/nuxt'],
  css: ['~/assets/main.css'],
  venda: { apiBase: 'https://api.venda.stevenjohn.co/api' },
  nitro: { preset: 'cloudflare_module' },
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
    }
  },
  typescript: { strict: true, typeCheck: true }
});
