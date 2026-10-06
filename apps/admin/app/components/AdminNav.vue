<script setup lang="ts">
import { listed, useAdmin, type AdminPage } from '@venda/admin';

const props = defineProps<{ pages: ReadonlyArray<AdminPage>; label: string }>();
const admin = useAdmin();
const route = useRoute();

// Writing lives at the top; setup is one link at the foot of the navigation.
const content = computed(() =>
  listed(props.pages, 'content', admin.user.value?.role)
);
const hasSettings = computed(
  () => listed(props.pages, 'settings', admin.user.value?.role).length > 0
);

const isCurrent = (path: string) =>
  route.path === `/${path}` || route.path.startsWith(`/${path}/`);
</script>

<template>
  <nav :aria-label="label" class="admin-nav">
    <div class="nav-section">
      <NuxtLink
        v-for="page in content"
        :key="page.id"
        :to="`/${page.path}`"
        class="nav-link"
        :class="{ 'nav-current': isCurrent(page.path) }"
        :aria-current="isCurrent(page.path) ? 'page' : undefined"
      >
        <UIcon :name="page.nav?.icon" class="size-4 shrink-0" />{{
          page.nav?.label
        }}
      </NuxtLink>
    </div>

    <NuxtLink
      v-if="hasSettings"
      to="/settings"
      class="nav-link nav-settings"
      :class="{ 'nav-current': isCurrent('settings') }"
      :aria-current="isCurrent('settings') ? 'page' : undefined"
    >
      <UIcon name="i-lucide-settings" class="size-4 shrink-0" />Settings
    </NuxtLink>
  </nav>
</template>
