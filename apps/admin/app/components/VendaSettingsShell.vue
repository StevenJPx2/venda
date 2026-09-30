<script setup lang="ts">
// Shared frame for account and workspace settings: back to content, then tabs.
defineProps<{ title: string; description?: string }>();

const session = useAdminSession();
const route = useRoute();

const tabs = computed(() => [
  { label: 'Profile', icon: 'i-lucide-user-round', to: '/settings/profile' },
  ...(session.can('users:manage') ? [{ label: 'Users', icon: 'i-lucide-users', to: '/settings/users' }] : []),
  { label: 'API tokens', icon: 'i-lucide-key-round', to: '/settings/tokens' }
]);
</script>

<template>
  <div class="min-h-svh bg-default">
    <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-default bg-default/90 px-4 backdrop-blur">
      <UButton to="/" icon="i-lucide-chevron-left" label="Content" color="neutral" variant="ghost" size="sm" />
      <span class="h-5 w-px bg-elevated" aria-hidden="true" />
      <span class="text-sm font-medium text-highlighted">Settings</span>
    </header>

    <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 md:flex-row">
      <nav aria-label="Settings" class="flex shrink-0 gap-1 md:w-48 md:flex-col">
        <UButton
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          :icon="tab.icon"
          :label="tab.label"
          :variant="route.path === tab.to ? 'soft' : 'ghost'"
          :color="route.path === tab.to ? 'primary' : 'neutral'"
          class="justify-start"
          :aria-current="route.path === tab.to ? 'page' : undefined"
        />
      </nav>

      <main class="min-w-0 flex-1 space-y-6">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">{{ title }}</h1>
          <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
        </div>
        <slot />
      </main>
    </div>
  </div>
</template>
