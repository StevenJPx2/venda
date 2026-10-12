<script setup lang="ts">
import {
  listed,
  useAdmin,
  useAdminResource,
  type AdminPage,
  type NavItem
} from '@venda/admin';

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

// Links a page lists beneath its heading (Content: one per collection), by page id.
const children = useAdminResource(
  async () =>
    new Map(
      await Promise.all(
        content.value.map(
          async page =>
            [
              page.id,
              page.nav?.items ? await page.nav.items(admin) : []
            ] as const
        )
      )
    )
);

// Every navigation reloads them, so a new collection appears without a refresh.
watch(() => route.path, children.reload, { immediate: true });

// Consecutive items of one group, under that group's heading.
function grouped(items: ReadonlyArray<NavItem>) {
  const groups: { label: string; items: NavItem[] }[] = [];

  for (const item of items) {
    const last = groups.at(-1);

    if (last?.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }

  return groups;
}

const sections = computed(() =>
  content.value.map(page => ({
    page,
    groups: grouped(children.data.value?.get(page.id) ?? [])
  }))
);

// The static build may serve a path with a trailing slash.
const isCurrent = (to: string) => {
  const path = route.path.replace(/\/$/, '');

  return path === to || path.startsWith(`${to}/`);
};
</script>

<template>
  <nav :aria-label="label" class="admin-nav">
    <template v-for="{ page, groups } in sections" :key="page.id">
      <template v-if="page.nav?.items">
        <div v-for="group in groups" :key="group.label" class="nav-section">
          <p class="nav-label">{{ group.label }}</p>

          <NuxtLink
            v-for="link in group.items"
            :key="link.to"
            :to="link.to"
            class="nav-link"
            :class="{ 'nav-current': isCurrent(link.to) }"
            :aria-current="isCurrent(link.to) ? 'page' : undefined"
          >
            <UIcon :name="link.icon" class="size-4 shrink-0" />
            <span class="truncate">{{ link.label }}</span>
          </NuxtLink>
        </div>
      </template>

      <NuxtLink
        v-else
        :to="`/${page.path}`"
        class="nav-link"
        :class="{ 'nav-current': isCurrent(`/${page.path}`) }"
        :aria-current="isCurrent(`/${page.path}`) ? 'page' : undefined"
      >
        <UIcon :name="page.nav?.icon" class="size-4 shrink-0" />{{
          page.nav?.label
        }}
      </NuxtLink>
    </template>

    <NuxtLink
      v-if="hasSettings"
      to="/settings"
      class="nav-link nav-settings"
      :class="{ 'nav-current': isCurrent('/settings') }"
      :aria-current="isCurrent('/settings') ? 'page' : undefined"
    >
      <UIcon name="i-lucide-settings" class="size-4 shrink-0" />Settings
    </NuxtLink>
  </nav>
</template>
