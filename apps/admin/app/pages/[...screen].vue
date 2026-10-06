<script setup lang="ts">
import { canOpen, resolvePage, useAdmin } from '@venda/admin';
import { adminPages } from '~/utils/plugins';

const admin = useAdmin();
const route = useRoute();
const resolved = computed(() => resolvePage(adminPages, route.path));
const allowed = computed(() => resolved.value && canOpen(resolved.value.page, admin.user.value?.role));
const component = computed(() => resolved.value ? defineAsyncComponent(resolved.value.page.load) : undefined);

useHead({ title: () => `${resolved.value?.page.title ?? 'Not found'} · Venda` });
</script>

<template>
  <component :is="component" v-if="allowed" :key="route.path" :params="resolved?.params" />

  <div v-else class="py-20">
    <h1 class="screen-title">{{ resolved ? 'You do not have access to this page' : 'Page not found' }}</h1>
    <UButton to="/content" label="Back to content" color="neutral" variant="outline" class="mt-6" />
  </div>
</template>
