<script setup lang="ts">
import { listed, useAdmin } from '@venda/admin';
import { registry } from '~/utils/plugins';

const admin = useAdmin();

// Every settings section any plugin contributes and this role may open.
const sections = computed(() =>
  listed(registry.pages, 'settings', admin.user.value?.role)
);

useHead({ title: 'Settings · Venda' });
</script>

<template>
  <div>
    <AdminScreenHeader
      title="Settings"
      description="How this site is set up: its files, its people and its keys."
    />

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

          <p v-if="page.nav?.description" class="mt-1 text-xs text-muted">
            {{ page.nav.description }}
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
