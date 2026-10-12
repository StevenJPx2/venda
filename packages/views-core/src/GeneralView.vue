<script setup lang="ts">
import { useAdmin, useAdminRegistry } from '@venda/admin';
import { computed, onMounted } from 'vue';
import { screenCopy } from './general';

// The site's own settings from content/site.ts: its name, its address and the
// words each screen opens with. Read-only until the write path.
const admin = useAdmin();
const registry = useAdminRegistry();
const site = admin.site;
const screens = computed(() => screenCopy(registry.pages, site.value));

onMounted(admin.refreshSite);
</script>

<template>
  <AdminScreenHeader title="General" />

  <p class="mb-6 max-w-xl text-sm text-muted">
    These come from <code>content/site.ts</code> in your repository. Edit that
    file to change them; the next page you open shows the change.
  </p>

  <div class="entry-form">
    <UFormField
      label="Site name"
      help="Shown in the sidebar and window titles."
    >
      <UInput :model-value="site?.name ?? ''" readonly class="w-full" />
    </UFormField>

    <UFormField label="Address">
      <UInput :model-value="site?.url ?? ''" readonly class="w-full" />
    </UFormField>
  </div>

  <h2 class="mt-10 mb-3 text-sm font-medium text-highlighted">
    Screen descriptions
  </h2>

  <div class="list-surface">
    <div v-for="screen in screens" :key="screen.id" class="content-row">
      <div class="min-w-0 flex-1">
        <p class="font-medium text-highlighted">
          {{ screen.title }}
          <code class="ms-2 text-xs text-muted">{{ screen.id }}</code>
        </p>

        <p class="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
          {{ screen.text || 'No description' }}
        </p>
      </div>

      <span class="shrink-0 text-xs text-muted">{{ screen.source }}</span>
    </div>
  </div>
</template>
