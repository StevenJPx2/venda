<script setup lang="ts">
const route = useRoute();

// Hash links resolve to "/", so Nuxt would mark all of them active on the home
// page; only the Blog link reflects the current route.
const navItems = computed(() => [
  { label: 'Features', to: '/#features', active: false },
  { label: 'How it works', to: '/#how', active: false },
  { label: 'Blog', to: '/blog', active: route.path.startsWith('/blog') }
]);
</script>

<template>
  <div class="min-h-svh bg-default">
    <UHeader title="Venda" to="/" :ui="{ title: 'font-bold tracking-tight' }">
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2 text-highlighted">
          <span class="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-inverted">V</span>
          <span class="font-semibold tracking-tight">Venda</span>
        </NuxtLink>
      </template>
      <template #default>
        <UNavigationMenu :items="navItems" />
      </template>
      <template #right>
        <UButton label="Open the app" icon="i-lucide-arrow-up-right" to="https://app.venda.stevenjohn.co" target="_blank" external size="sm" />
      </template>
    </UHeader>

    <main>
      <slot />
    </main>

    <UFooter class="mt-12">
      <template #left>
        <p class="text-sm text-muted">© {{ new Date().getFullYear() }} Venda · content, at the edge. Powered by Venda itself.</p>
      </template>
      <template #right>
        <div class="flex items-center gap-3">
          <UButton label="Blog" color="neutral" variant="link" to="/blog" />
          <UButton label="App" color="neutral" variant="link" to="https://app.venda.stevenjohn.co" target="_blank" external />
          <UButton label="API" color="neutral" variant="link" to="https://api.venda.stevenjohn.co/api/content/blog" target="_blank" external />
        </div>
      </template>
    </UFooter>
  </div>
</template>
