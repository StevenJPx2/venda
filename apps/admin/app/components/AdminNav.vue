<script setup lang="ts">
import { canOpen, useAdmin, type AdminPage } from '@venda/admin';

const props = defineProps<{ pages: ReadonlyArray<AdminPage>; label: string }>();
const admin = useAdmin();
const route = useRoute();

const links = computed(() =>
  props.pages.filter(
    page =>
      page.nav &&
      canOpen(page, admin.user.value?.role) &&
      page.section !== 'public'
  )
);

const sections = computed(() =>
  (['content', 'settings', 'account'] as const)
    .map(section => ({
      section,
      pages: links.value.filter(page => page.section === section)
    }))
    .filter(group => group.pages.length > 0)
);

const isCurrent = (path: string) =>
  route.path === `/${path}` || route.path.startsWith(`/${path}/`);
</script>

<template>
  <nav :aria-label="label" class="admin-nav">
    <div v-for="group in sections" :key="group.section" class="nav-section">
      <p v-if="group.section === 'settings'" class="nav-label">Settings</p>

      <NuxtLink
        v-for="page in group.pages"
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
  </nav>
</template>
