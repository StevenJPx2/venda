// The same-origin admin shell; its screens are build-time plugins. The static
// build is served by @venda/server, never by a second admin server in production.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = fileURLToPath(new URL('../../packages', import.meta.url));

// Nuxt Icon's scan cannot reach the plugin packages: any pattern outside this
// app makes it lose the app's own files. So their icon names are collected here
// and bundled by name.
function packageIcons(): string[] {
  const names = new Set<string>();

  for (const name of readdirSync(PACKAGES)) {
    const src = join(PACKAGES, name, 'src');

    if (!existsSync(src)) continue;

    for (const file of readdirSync(src, { recursive: true, encoding: 'utf8' }))
      if (/\.(vue|ts)$/.test(file))
        for (const [, icon] of readFileSync(join(src, file), 'utf8').matchAll(
          /\bi-lucide-([a-z0-9-]+)/g
        ))
          names.add(`lucide:${icon}`);
  }

  return [...names].sort();
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/main.css'],
  ssr: false,
  buildDir: process.env.VENDA_ADMIN_BUILD_DIR ?? '.nuxt',
  app: {
    baseURL: '/admin/',
    head: {
      script: process.env.VENDA_TRY_RELOAD
        ? [{ src: process.env.VENDA_TRY_RELOAD, defer: true }]
        : []
    }
  },
  nitro: {
    output: { publicDir: process.env.VENDA_ADMIN_OUTPUT_DIR ?? 'dist' }
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
  // The admin is static files on the Worker: there is no icon endpoint, and it
  // must not call Iconify's public API at runtime. Icons come from the
  // installed @iconify-json/lucide data, bundled for every name written in the
  // shell (scanned) and in the plugin packages (collected above).
  icon: {
    provider: 'none',
    clientBundle: {
      scan: { globInclude: ['app/**/*.{vue,ts}'] },
      icons: packageIcons()
    }
  },
  ui: {
    theme: {
      colors: [
        'primary',
        'secondary',
        'success',
        'info',
        'warning',
        'error',
        'neutral'
      ]
    }
  },
  typescript: { strict: true, typeCheck: true }
});
