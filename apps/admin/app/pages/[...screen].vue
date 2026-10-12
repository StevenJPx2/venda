<script setup lang="ts">
import { canOpen, resolvePage, useAdmin, windowTitle } from '@venda/admin';
import { registry } from '~/utils/plugins';
import { ScreenKey } from '~/utils/screen';

const admin = useAdmin();
const route = useRoute();
const resolved = computed(() => resolvePage(registry.pages, route.path));

provide(
  ScreenKey,
  computed(() => resolved.value?.page)
);
const allowed = computed(
  () => resolved.value && canOpen(resolved.value.page, admin.user.value?.role)
);
const component = computed(() =>
  resolved.value ? defineAsyncComponent(resolved.value.page.load) : undefined
);

useHead({
  title: () =>
    windowTitle(admin.site.value, resolved.value?.page.title ?? 'Not found')
});
</script>

<template>
  <component
    :is="component"
    v-if="allowed"
    :key="route.path"
    :params="resolved?.params"
  />

  <div v-else class="py-20">
    <h1 class="screen-title">
      {{ resolved ? 'You do not have access to this page' : 'Page not found' }}
    </h1>

    <UButton
      to="/content"
      label="Back to content"
      color="neutral"
      variant="outline"
      class="mt-6"
    />
  </div>
</template>
