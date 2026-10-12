<script setup lang="ts">
import {
  listed,
  screenDescription,
  SETTINGS_SCREEN,
  useAdmin,
  windowTitle
} from '@venda/admin';
import { registry } from '~/utils/plugins';
import { ScreenKey } from '~/utils/screen';

const admin = useAdmin();

provide(
  ScreenKey,
  computed(() => SETTINGS_SCREEN)
);

// Every settings section any plugin contributes and this role may open, each
// described in the site's words when site.ts gives them.
const sections = computed(() =>
  listed(registry.pages, 'settings', admin.user.value?.role).map(page => ({
    ...page,
    note: screenDescription(admin.site.value, page.id, page.description)
  }))
);

useHead({ title: () => windowTitle(admin.site.value, SETTINGS_SCREEN.title) });
</script>

<template>
  <div>
    <AdminScreenHeader :title="SETTINGS_SCREEN.title" />

    <AdminFeedback
      :empty="sections.length === 0"
      title="Nothing to set up"
      description="Your role has no settings to change."
    />

    <div class="list-surface">
      <NuxtLink
        v-for="page in sections"
        :key="page.id"
        :to="`/${page.path}`"
        class="content-row"
      >
        <UIcon :name="page.nav?.icon" class="size-5 shrink-0 text-muted" />

        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">{{ page.nav?.label }}</p>

          <p v-if="page.note" class="mt-1 text-xs text-muted">
            {{ page.note }}
          </p>
        </div>

        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-dimmed"
        />
      </NuxtLink>
    </div>
  </div>
</template>
